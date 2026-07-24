# KBU-MedLab Precision Oncology Pipeline (Website v3)

## Overview
This repository contains the rebuilt, professional academic frontend and backend architecture for the `inshalllahsonmodel_v3` predictor. It has been transformed from a standard dashboard into an interactive, live-pipeline visualizer demonstrating the exact analytical steps a sample takes during computational subtype prediction.

## What Changed from the Old Website
1. **Academic Branding:** Added "KBU-MedLab" academic branding, professional copy, and the institutional logo.
2. **Visual Pipeline Storytelling:** Implemented a new animated state-machine using Framer Motion. When a user uploads a file, the UI simulates the execution pipeline (QC -> Branching -> PCA -> Voting) before displaying the real result.
3. **Centroid Proximity Maps:** Replaced ambiguous data representations with a clean 1D Centroid Distance profile chart. (A true 2D PCA scatter is impossible without modifying the backend to export `X_pca` raw coordinates).
4. **Soft Support Integration:** Visualizes the inverse-distance weighted Soft Support Matrix for deep insight into model decision-making.
5. **Vote Assembly:** Displays the specific variables (Coverage, Purity, Confidence, Outlier Penalty) that assemble the final weight for each branch.
6. **Codebase Cleanup:** Transitioned to Tailwind CSS combined with Framer Motion and Recharts for a clean glass-morphic UI.

## Model Details
- **Target Model:** `inshalllahsonmodel_v3`
- **Predictor Script:** `/Users/ask3r/Desktop/TEKNOFEST_ONCOLOGY/DENEME/clusetiong/FINAL_CLUSTERING/inshalllahsonmodel_v3/inshalllahsonmodel_predictor.py`
- **Backend Arguments Used:** `--predict_one`, `--new_sample <file>`, `--enable_branch_C_approx`, `--save_outputs`

## Input Format Expected
- **File Type:** STAR-aligned RNA-seq counts file (`.tsv`, `.csv`, `.txt`).
- **Columns:** Must contain ENSG identifiers as the index or first column, an `unstranded` raw counts column, and ideally a `tpm_unstranded` column (without TPM, Branch A will safely skip).

## Output Files Generated & Downloadable
The UI directly provides a ZIP bundle or individual file downloads containing:
- `prediction_summary.json` / `.txt`
- `branch_predictions.tsv`
- `centroid_distances.tsv`
- `soft_subtype_support.tsv`
- `voting_decision.tsv`
- `mapping_reliability.tsv`
- `warning_report.txt`
- `run_log.txt`
- Explanatory Reference Excel Workbooks.

## How to Run

### Terminal 1 - Backend (FastAPI + Python)
```bash
cd "/Users/ask3r/Desktop/TEKNOFEST_ONCOLOGY/DENEME/website_3/backend"
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

Backend health check:
```bash
curl -s http://127.0.0.1:8001/api/health
```

### Terminal 2 - Frontend (Vite + React)
The frontend lives in the nested `frontend/` folder, not at the repository root.

```bash
cd "/Users/ask3r/Desktop/TEKNOFEST_ONCOLOGY/DENEME/website_3/frontend"
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Frontend URL:
```text
http://127.0.0.1:5173
```

## Scientific Limitations & Caveats
1. **Computational Only:** The output constitutes an exploratory transcriptomic cluster mapping intended strictly for research purposes, not for clinical diagnostic proof.
2. **Branch C Proxy:** Branch C relies on a simplistic `log2(raw_count + 1)` transformation because single-sample inputs cannot natively trigger a cohort-wide DESeq2 VST. The model structurally mitigates this with a 15% reliability penalty.
3. **Centroid Proximity Interpretation:** The 5-dimensional distance arrays exported by the predictor are mapped linearly to visualize centroid proximity. They represent absolute distance values. Because the model script does not currently export PCA dimension coordinates, **no true 2D PCA scatterplot is rendered** to avoid misleading the user.
4. **Outlier Boundaries:** Samples positioned too far from cluster medians receive distance penalties, meaning confidence does not scale endlessly. 
