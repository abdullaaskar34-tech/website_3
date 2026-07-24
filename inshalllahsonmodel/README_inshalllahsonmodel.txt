README: INSHALLAHSONMODEL
=========================

WHAT IS THIS?
inshalllahsonmodel is a fully independent, consensus-based prediction package for transcriptomic subtyping. It integrates the top-performing models from three independent normalization branches (A: TPM, B: CPM, C: VST/Counts) into a shared voting system.

CORE PRINCIPLES:
1. Strict Independence: Built without using previous final ensemble outputs.
2. Verified Mapping: Uses direct manifest indexing to link sample IDs to raw files.
3. Aligned Voting: Branch-level predictions are mapped into a shared consensus space before voting.

HOW TO RUN:

python3 inshalllahsonmodel_predictor.py \
  --predict_one \
  --new_sample "path/to/raw_file.tsv" \
  --enable_branch_C_approx \
  --save_outputs

PACKAGE STRUCTURE:
- /artifacts: Reconstructed scalers, PCA components, and centroids.
- /reference_tables: Standardized assignments and consensus mapping.
- /reports: Audit and build documentation.
- /outputs: Prediction summaries and class-specific Excel files.

EXCEL OUTPUTS:
Every prediction with `--save_outputs` generates 4 Excel files (class_0..3).
- class_N.xlsx will mark 'BELONG' or 'NOT BELONG' based on the prediction.
- Each file contains a full index of training samples belonging to that class.

LIMITATIONS:
- Single-sample Branch C prediction uses log2(counts+1) as a proxy for VST.
- Voting requires at least one branch to complete successfully.

DEVELOPER:
Bioinformatics ML Engineering Team (Gemini CLI)
