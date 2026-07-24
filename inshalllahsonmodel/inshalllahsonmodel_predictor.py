import os
import sys
import pandas as pd
import numpy as np
import joblib
import argparse
import time
import json
import glob
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

# --- PATHS ---
SON_DIR = "/Users/ask3r/Desktop/TEKNOFEST_ONCOLOGY/DENEME/clusetiong/FINAL_CLUSTERING/inshalllahsonmodel"
ART_DIR = os.path.join(SON_DIR, "artifacts")
REF_DIR = os.path.join(SON_DIR, "reference_tables")
OUT_BASE = os.path.join(SON_DIR, "outputs")

BRANCHES = ["Branch_A", "Branch_B", "Branch_C"]

def load_branch_artifacts(branch):
    gene_list = pd.read_csv(os.path.join(ART_DIR, f"{branch}_gene_list.tsv"), sep='\t', header=None)[0].tolist()
    scaler = joblib.load(os.path.join(ART_DIR, f"{branch}_scaler.joblib"))
    pca = joblib.load(os.path.join(ART_DIR, f"{branch}_pca.joblib"))
    centroids = pd.read_csv(os.path.join(ART_DIR, f"{branch}_centroids.tsv"), sep='\t', index_col=0)
    return gene_list, scaler, pca, centroids

def load_alignment():
    df = pd.read_csv(os.path.join(REF_DIR, "branch_to_consensus_alignment.tsv"), sep='\t')
    mapping = {}
    for _, row in df.iterrows():
        b = row['branch']
        if b not in mapping: mapping[b] = {}
        mapping[b][int(row['branch_cluster_label'])] = int(row['mapped_consensus_class'])
    return mapping

def load_sample(path):
    try:
        df = pd.read_csv(path, sep='\t', comment='#')
        # Filter technology rows
        tech = ['N_unmapped', 'N_multimapping', 'N_noFeature', 'N_ambiguous']
        df = df[~df.iloc[:, 0].isin(tech)]
        df = df[df.iloc[:, 0].str.startswith('ENSG')]
        df = df.set_index('gene_id')
        raw = df['unstranded'] if 'unstranded' in df.columns else df.iloc[:, 0]
        tpm = df['tpm_unstranded'] if 'tpm_unstranded' in df.columns else None
        return raw.apply(pd.to_numeric), (tpm.apply(pd.to_numeric) if tpm is not None else None)
    except Exception as e:
        print(f"Error loading sample: {e}")
        return None, None

def safe_gene_match(sample_series, expected_genes):
    input_genes = set(sample_series.index)
    found_exact = [g for g in expected_genes if g in input_genes]
    if len(found_exact) / len(expected_genes) >= 0.95:
        return sample_series.reindex(expected_genes).fillna(0), len(found_exact)/len(expected_genes)
    
    # Try version-less matching
    def strip(g): return g.split('.')[0]
    input_mapping = {strip(g): g for g in sample_series.index}
    output = []
    found = 0
    for g in expected_genes:
        s_g = strip(g)
        if g in input_genes:
            output.append(sample_series[g]); found += 1
        elif s_g in input_mapping:
            output.append(sample_series[input_mapping[s_g]]); found += 1
        else: output.append(0.0)
    return pd.Series(output, index=expected_genes), found/len(expected_genes)

def predict_branch(branch, raw, tpm, approx_vst):
    genes, scaler, pca, centroids = load_branch_artifacts(branch)
    
    if branch == "Branch_A":
        if tpm is not None:
            matched, cov = safe_gene_match(tpm, genes)
            processed = np.log2(matched + 1)
        else: return {"status": "skipped", "reason": "no_tpm"}
    elif branch == "Branch_B":
        matched, cov = safe_gene_match(raw, genes)
        cpm = (matched / raw.sum()) * 1e6
        processed = np.log2(cpm + 1)
    else: # Branch C
        if not approx_vst: return {"status": "skipped", "reason": "no_approx_flag"}
        matched, cov = safe_gene_match(raw, genes)
        processed = np.log2(matched + 1)
        
    if cov < 0.6: return {"status": "skipped", "reason": f"low_coverage ({cov:.1%})"}
    
    # Scale and PCA
    X_scaled = scaler.transform(pd.DataFrame([processed.values], columns=genes))
    X_pca = pca.transform(X_scaled)[0]
    
    # Nearest Centroid
    dists = {int(c): np.linalg.norm(X_pca - centroids.loc[c].values) for c in centroids.index}
    best_c = min(dists, key=dists.get)
    
    # Relative Confidence
    sorted_d = sorted(dists.values())
    rel_conf = (sorted_d[1] - sorted_d[0]) / (sorted_d[0] + 1e-9)
    
    return {
        "status": "completed",
        "raw_cluster": best_c,
        "confidence": rel_conf,
        "coverage": cov,
        "distances": dists
    }

def generate_excel_outputs(out_dir, sid, sample_path, final_pred, branch_results, mapped_votes):
    import pandas as pd
    from openpyxl import Workbook
    
    df_consensus = pd.read_csv(os.path.join(REF_DIR, "branch_only_consensus_labels.tsv"), sep='\t')
    df_metrics = pd.read_csv(os.path.join(REF_DIR, "selected_model_metrics_standardized.tsv"), sep='\t')
    
    for i in range(4):
        file_path = os.path.join(out_dir, f"class_{i}.xlsx")
        writer = pd.ExcelWriter(file_path, engine='openpyxl')
        
        # Sheet 1: Summary
        status = "BELONG" if final_pred == i else "NOT BELONG"
        summary_data = [
            ["Input Sample ID", sid],
            ["Input Raw File Path", sample_path],
            ["Final Predicted Class", final_pred],
            ["This Excel Class", i],
            ["Status", status],
            ["Training Samples in Class", len(df_consensus[df_consensus['branch_only_consensus_class'] == i])],
            ["Timestamp", time.strftime("%Y-%m-%d %H:%M:%S")]
        ]
        pd.DataFrame(summary_data, columns=["Field", "Value"]).to_excel(writer, sheet_name="Summary", index=False)
        
        # Sheet 2: Sample_Index
        class_samples = df_consensus[df_consensus['branch_only_consensus_class'] == i]
        class_samples.to_excel(writer, sheet_name="Sample_Index", index=False)
        
        # Sheet 3: Prediction_Info
        pred_info = []
        for b in BRANCHES:
            res = branch_results[b]
            pred_info.append([
                b, 
                res.get('raw_cluster', 'N/A'),
                mapped_votes.get(b, 'N/A'),
                res.get('confidence', 0),
                res.get('status', 'skipped')
            ])
        pd.DataFrame(pred_info, columns=["Branch", "Raw_Cluster", "Mapped_Class", "Confidence", "Status"]).to_excel(writer, sheet_name="Prediction_Info", index=False)
        
        writer.close()

def main():
    parser = argparse.ArgumentParser(description="Inshalllahsonmodel Predictor")
    parser.add_argument("--predict_one", action="store_true")
    parser.add_argument("--new_sample")
    parser.add_argument("--enable_branch_C_approx", action="store_true")
    parser.add_argument("--save_outputs", action="store_true")
    parser.add_argument("--terminal_only", action="store_true")
    args = parser.parse_args()

    if args.predict_one:
        if not args.new_sample:
            print("ERROR: --new_sample required")
            return
        
        sid = os.path.basename(args.new_sample).split('.')[0]
        raw, tpm = load_sample(args.new_sample)
        if raw is None: return

        align_map = load_alignment()
        
        results = {}
        mapped_votes = {}
        votes_list = []
        
        print(f"\nINSHALLAHSONMODEL PREDICTION: {sid}")
        print("="*40)
        
        for b in BRANCHES:
            res = predict_branch(b, raw, tpm, args.enable_branch_C_approx)
            results[b] = res
            if res['status'] == 'completed':
                m_class = align_map[b][res['raw_cluster']]
                mapped_votes[b] = m_class
                votes_list.append(m_class)
                print(f"{b}: Raw={res['raw_cluster']}, Mapped Class={m_class} (Conf={res['confidence']:.3f})")
            else:
                print(f"{b}: Skipped ({res['reason']})")
                
        if votes_list:
            final_pred = max(set(votes_list), key=votes_list.count)
            agreement = votes_list.count(final_pred) / len(votes_list)
            print(f"\nFinal Voted Class: {final_pred}")
            print(f"Agreement: {agreement:.1%} ({votes_list.count(final_pred)}/{len(votes_list)})")
        else:
            final_pred = "uncertain"
            print("\nFinal Voted Class: uncertain")

        if args.save_outputs:
            ts = time.strftime("%Y%m%d_%H%M%S")
            out_dir = os.path.join(OUT_BASE, f"{sid}_{ts}")
            os.makedirs(out_dir, exist_ok=True)
            
            # 1. Excel Generation
            if final_pred != "uncertain":
                generate_excel_outputs(out_dir, sid, args.new_sample, final_pred, results, mapped_votes)

            # 2. Selected Model Metrics Used TSV
            df_metrics = pd.read_csv(os.path.join(REF_DIR, "selected_model_metrics_standardized.tsv"), sep='\t')
            df_metrics.to_csv(os.path.join(out_dir, "selected_model_metrics_used.tsv"), sep='\t', index=False)
            
            # 3. Rawfile Export Audit TSV
            pd.DataFrame([{
                "sample_id": sid,
                "raw_file": args.new_sample,
                "excel_status": "Generated" if final_pred != "uncertain" else "Skipped"
            }]).to_csv(os.path.join(out_dir, "rawfile_export_audit.tsv"), sep='\t', index=False)
            
            # 4. Branch Predictions TSV
            b_rows = []
            for b, res in results.items():
                b_rows.append({
                    "branch": b,
                    "status": res['status'],
                    "raw_cluster": res.get('raw_cluster'),
                    "mapped_consensus_class": mapped_votes.get(b),
                    "confidence": res.get('confidence'),
                    "coverage": res.get('coverage')
                })
            pd.DataFrame(b_rows).to_csv(os.path.join(out_dir, "branch_predictions.tsv"), sep='\t', index=False)

            # 5. Centroid Distances TSV
            dist_rows = []
            for b, res in results.items():
                if 'distances' in res:
                    row = {"branch": b}
                    for c, d in res['distances'].items():
                        row[f"cluster_{c}_distance"] = d
                    dist_rows.append(row)
            pd.DataFrame(dist_rows).to_csv(os.path.join(out_dir, "centroid_distances.tsv"), sep='\t', index=False)

            # 6. Voting Decision TSV
            pd.DataFrame([{
                "sample_id": sid,
                "votes_list": str(votes_list),
                "final_prediction": final_pred,
                "agreement": agreement if votes_list else 0
            }]).to_csv(os.path.join(out_dir, "voting_decision.tsv"), sep='\t', index=False)

            # 7. Summary JSON
            summary = {
                "sample_id": sid,
                "input_file": args.new_sample,
                "branch_results": results,
                "final_prediction": final_pred,
                "votes_list": votes_list,
                "timestamp": ts
            }
            with open(os.path.join(out_dir, "prediction_summary.json"), 'w') as f:
                json.dump(summary, f, indent=2)

            # 8. Summary Text
            with open(os.path.join(out_dir, "prediction_summary.txt"), 'w') as f:
                f.write(f"INSHALLAHSONMODEL PREDICTION SUMMARY\n")
                f.write(f"====================================\n")
                f.write(f"Sample: {sid}\n")
                f.write(f"Final Predicted Class: {final_pred}\n")
                f.write(f"Votes in shared space: {votes_list}\n\n")
                f.write(f"Details:\n")
                for b, res in results.items():
                    f.write(f"- {b}: {res['status']} (Raw Clus: {res.get('raw_cluster')}, Mapped: {mapped_votes.get(b)})\n")
            
            print(f"\nOutputs saved to: {out_dir}")

if __name__ == "__main__":
    main()
