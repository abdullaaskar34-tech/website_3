import os
import sys
import shutil
import subprocess
import glob
import json
import zipfile
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

app = FastAPI(title="Inshallahsonmodel Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_PATH = "/Users/ask3r/Desktop/TEKNOFEST_ONCOLOGY/DENEME"

# --- MIGRATED (son_model consensus model) ---------------------------------
# The backend now serves predictions from the new Evidence-Accumulation
# consensus model. son_model/consensus_predictor.py reuses the trained
# inshalllahsonmodel_v3 branch-inference artifacts (scaler/PCA/centroids) but
# re-maps each branch's raw cluster into the son_model consensus class space
# via son_model/mapping_reference.tsv. It exposes the SAME CLI
# (--predict_one/--new_sample/--enable_branch_C_approx/--save_outputs) and
# writes the SAME artifact schema, so the subprocess handoff is unchanged.
SON_MODEL_DIR = os.path.join(BASE_PATH, "son_model")
MODEL_DIR = SON_MODEL_DIR
PREDICTOR_SCRIPT = os.path.join(SON_MODEL_DIR, "consensus_predictor.py")
MODEL_OUTPUTS_DIR = os.path.join(SON_MODEL_DIR, "prediction_outputs")
os.makedirs(MODEL_OUTPUTS_DIR, exist_ok=True)

# Interpreter used to run the consensus predictor. This is DELIBERATELY
# decoupled from the FastAPI virtualenv: the predictor needs the full
# scientific stack (numpy/pandas/scikit-learn/joblib/openpyxl), which lives in
# the system Python 3.14 framework install. The backend's own .venv does not
# carry a working sklearn/joblib (importing them there hangs), so relying on the
# ambient "python3" would deadlock the subprocess. Override with the
# PREDICTOR_PYTHON env var if the ML interpreter moves.
def _resolve_predictor_python():
    env = os.environ.get("PREDICTOR_PYTHON")
    candidates = [
        env,
        "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3",
        shutil.which("python3"),
        sys.executable,
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return "python3"

PREDICTOR_PYTHON = _resolve_predictor_python()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
RUNS_DIR = os.path.join(os.path.dirname(__file__), "server_runs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RUNS_DIR, exist_ok=True)

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "active_model": "son_model (Evidence Accumulation Clustering consensus)",
        "predictor_path": PREDICTOR_SCRIPT,
        "predictor_available": os.path.exists(PREDICTOR_SCRIPT),
        "predictor_python": PREDICTOR_PYTHON,
        "model_dir": MODEL_DIR,
    }

@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    if not file.filename.endswith(('.tsv', '.txt', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file extension.")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    sample_id = file.filename.split(".")[0]
    
    # Run the son_model consensus predictor (same CLI as the legacy predictor).
    # Use the resolved scientific-stack interpreter, NOT the ambient python3.
    cmd = [
        PREDICTOR_PYTHON, PREDICTOR_SCRIPT,
        "--predict_one",
        "--new_sample", file_path,
        "--enable_branch_C_approx",
        "--save_outputs"
    ]

    if not os.path.exists(PREDICTOR_SCRIPT):
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline Execution Failed: consensus predictor not found at {PREDICTOR_SCRIPT}"
        )

    # Robust subprocess handoff: capture stderr/stdout and surface a clean 500
    # so the frontend "Pipeline Execution Failed" panel can render the log.
    try:
        result = subprocess.run(
            cmd, cwd=MODEL_DIR, capture_output=True, text=True, check=True, timeout=600
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=500,
            detail="Pipeline Execution Failed: son_model consensus predictor timed out after 600s."
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=(
                "Pipeline Execution Failed (son_model consensus predictor).\n\n"
                f"STDERR:\n{e.stderr or '(empty)'}\n\nSTDOUT:\n{e.stdout or '(empty)'}"
            )
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline Execution Failed: unexpected error invoking predictor: {repr(e)}"
        )

    # Find the timestamped output folder ({sample_id}_YYYYmmdd_HHMMSS) in son_model
    matching_dirs = glob.glob(os.path.join(MODEL_OUTPUTS_DIR, f"{sample_id}_*"))
    if not matching_dirs:
        raise HTTPException(
            status_code=500,
            detail=(
                "Pipeline Execution Failed: son_model predictor produced no output folder.\n\n"
                f"STDOUT:\n{result.stdout or '(empty)'}\n\nSTDERR:\n{result.stderr or '(empty)'}"
            )
        )
        
    # Get latest
    latest_out_dir = max(matching_dirs, key=os.path.getmtime)
    
    # Copy to our server_runs so frontend can download
    run_id = os.path.basename(latest_out_dir)
    server_run_dir = os.path.join(RUNS_DIR, run_id)
    if not os.path.exists(server_run_dir):
        shutil.copytree(latest_out_dir, server_run_dir)
    
    # Parse results to return to frontend
    def clean_nan(obj):
        if isinstance(obj, dict):
            return {k: clean_nan(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean_nan(i) for i in obj]
        elif isinstance(obj, float) and np.isnan(obj):
            return None
        return obj

    def read_json(name):
        path = os.path.join(server_run_dir, name)
        if os.path.exists(path):
            with open(path, 'r') as f: 
                try: 
                    data = json.load(f)
                    return clean_nan(data)
                except: return None
        return None

    def read_tsv(name):
        path = os.path.join(server_run_dir, name)
        if os.path.exists(path):
            try:
                df = pd.read_csv(path, sep='\t')
                return json.loads(df.to_json(orient="records"))
            except:
                return []
        return None
        
    def read_txt(name):
        path = os.path.join(server_run_dir, name)
        if os.path.exists(path):
            with open(path, 'r') as f: return f.read()
        return None

    # Supplementary QC parsing
    qc_data = {}
    try:
        df_qc = pd.read_csv(file_path, sep='\t', comment='#')
        qc_data = {
            "total_rows": len(df_qc),
            "columns": list(df_qc.columns),
            "unstranded_detected": "unstranded" in df_qc.columns,
            "tpm_unstranded_detected": "tpm_unstranded" in df_qc.columns,
            "total_raw_count": float(df_qc["unstranded"].sum()) if "unstranded" in df_qc.columns else 0,
            "tpm_sum": float(df_qc["tpm_unstranded"].sum()) if "tpm_unstranded" in df_qc.columns else 0,
            "row_preview": json.loads(df_qc.head(5).to_json(orient="records"))
        }
    except Exception as e:
        qc_data = {"error": f"Could not parse supplementary QC: {str(e)}"}

    prediction_summary = read_json("prediction_summary.json")
    branch_predictions = read_tsv("branch_predictions.tsv")
    centroid_distances = read_tsv("centroid_distances.tsv")
    voting_decision = read_tsv("voting_decision.tsv")
    mapping_reliability = read_tsv("mapping_reliability.tsv")
    soft_subtype_support = read_tsv("soft_subtype_support.tsv")
    warning_report = read_txt("warning_report.txt")
    run_log = read_txt("run_log.txt")
    
    # Also find all generated files
    all_files = [os.path.basename(f) for f in glob.glob(os.path.join(server_run_dir, "*")) if os.path.isfile(f)]

    return {
        "status": "success",
        "run_id": run_id,
        "sample_id": sample_id,
        "qc_data": qc_data,
        "prediction_summary": prediction_summary,
        "branch_predictions": branch_predictions,
        "centroid_distances": centroid_distances,
        "voting_decision": voting_decision,
        "mapping_reliability": mapping_reliability,
        "soft_subtype_support": soft_subtype_support,
        "warning_report": warning_report,
        "run_log": run_log,
        "files_generated": all_files
    }

@app.get("/api/download/{run_id}/{filename}")
async def download_file(run_id: str, filename: str):
    file_path = os.path.join(RUNS_DIR, run_id, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/download/{run_id}")
async def download_all(run_id: str):
    dir_path = os.path.join(RUNS_DIR, run_id)
    if not os.path.exists(dir_path):
        raise HTTPException(status_code=404, detail="Run not found")
        
    zip_path = os.path.join(RUNS_DIR, f"{run_id}.zip")
    if not os.path.exists(zip_path):
        shutil.make_archive(os.path.join(RUNS_DIR, run_id), 'zip', dir_path)
        
    return FileResponse(zip_path, filename=f"{run_id}_outputs.zip", media_type="application/zip")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
