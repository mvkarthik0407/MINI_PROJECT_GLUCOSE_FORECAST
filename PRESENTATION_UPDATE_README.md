# Presentation Update Guide: MetaboNet Multimodal GRU

This guide updates `AI_Diabetes_Digital_Twin_Mini_Project_Review (1).pptx`
from the original glucose-only GRU model to the current second model.

The application architecture remains the same. Only the forecasting dataset,
preprocessing, model input/output description, and model-result slides need to
be updated.

## 1. Facts to use consistently

Use these facts throughout the presentation:

| Item | Current implementation |
|---|---|
| Dataset | MetaboNet consolidated Type 1 diabetes dataset |
| File format | `train.parquet` and `test.parquet` |
| Dataset rows inspected | 132,811,004 train rows and 22,069,548 test rows |
| Dataset columns | 37 standardized columns |
| Sampling interval | 5 minutes |
| Historical input | 48 readings = 4 hours |
| Forecast output | 6 direct future readings |
| Forecast horizon | +5, +10, +15, +20, +25, and +30 minutes |
| Selected model inputs | CGM, basal insulin, bolus insulin, carbohydrates, time-of-day sine/cosine, weekday sine/cosine |
| Number of model inputs | 8 features per time step |
| Model | GRU with hidden size 64 and direct six-step output |
| Missing CGM handling | Invalid values are removed; gaps up to 30 minutes are interpolated |
| Missing event handling | Missing basal insulin, bolus insulin, and carbohydrates are filled with zero |
| Scaling | Scaler fitted only on the training portion to avoid validation leakage |
| Evaluation sample | 100,000 holdout windows from `test.parquet` |
| MAE | 10.3405 mg/dL |
| RMSE | 15.3403 mg/dL |
| R-squared | 0.9128 |

Important: do not say that all 37 dataset columns are model inputs. The
dataset has 37 standardized columns, but the current model uses the eight
features listed above. Sparse fields such as meal text, exercise, heart rate,
skin temperature, and galvanic skin response were not used in this first
multimodal implementation.

The supplied train/test files have some overlapping source-patient groups.
Therefore, describe the result as a holdout evaluation, not as proof of
generalization to entirely unseen patients.

## 2. Old result values to remove

Remove the following original-model claims wherever they appear:

- T1DiabetesGranada as the training dataset
- `Glucose_measurements.csv`, `Patient_info.csv`, `Biochemical_parameters.csv`,
  and `Diagnostics.csv`
- 736 Granada patients and 22.67 million measurements
- Three model features: glucose, age, and sex
- 15-minute recursive prediction
- 12-hour input history
- Three-hour recursive forecast
- 3,365,788 test sequences
- MAE `6.4427`
- RMSE `11.5862`
- R-squared `0.97575`
- Claims that the 3-hour forecast was directly evaluated using those metrics

The old metrics must not be combined with the new metrics. They belong to a
different dataset, feature set, and forecasting setup.

## 3. Slide-by-slide changes

### Slide 1: Title

The title can remain:

> AI-Driven Diabetes Digital Twin for Personalized Glucose Monitoring and
> Forecasting Using GRU, RAG, and MCP

Optional subtitle:

> Multimodal 30-Minute Glucose Forecasting Using the MetaboNet Dataset

Do not add old dataset or old metric claims to the title slide.

### Slide 2: Abstract — REPLACE

Use:

> Diabetes is a chronic condition that requires continuous glucose monitoring.
> Sudden glucose fluctuations may lead to hypoglycemia or hyperglycemia. This
> project develops an AI-driven Diabetes Digital Twin for personalized glucose
> monitoring, short-term forecasting, risk classification, and safe
> decision-support. The forecasting model is a multimodal GRU trained with
> MetaboNet 5-minute data. It uses CGM glucose, basal insulin, bolus insulin,
> carbohydrates, time-of-day, and weekday information. The model receives 48
> historical readings, representing four hours, and directly predicts six
> glucose values for the next 30 minutes. The system also provides a dashboard,
> alerts, what-if simulation, curated RAG guidance, MCP-style patient tools,
> and a safety-constrained chatbot. On a 100,000-window holdout sample, the
> model achieved MAE 10.3405 mg/dL, RMSE 15.3403 mg/dL, and R-squared 0.9128.

Update keywords to:

> Diabetes Digital Twin, MetaboNet, multimodal GRU, CGM, insulin, carbohydrates,
> 30-minute glucose forecasting, RAG, MCP, Gemini, personalized healthcare.

### Slide 3: Presentation Outline — NO CONTENT CHANGE

The outline remains valid. Ensure the later headings say `MetaboNet Dataset`
and `Multimodal GRU Forecasting`.

### Slide 4: Aim and Motivation — SMALL CHANGE

Keep the aim and motivation. Replace the motivation sentence about causes with:

> Glucose levels can change rapidly because of meals, insulin delivery,
> physical activity, stress, illness, and other factors. The selected MetaboNet
> features allow the forecasting model to use available glucose, insulin, and
> carbohydrate information together with temporal patterns.

### Slide 5: Research Questions — REPLACE TWO QUESTIONS

Keep the general questions, but replace:

> Does adding patient age and sex improve personalization?

with:

> Does combining CGM, basal insulin, bolus insulin, carbohydrates, and temporal
> features improve short-term glucose forecasting?

Replace:

> Can historical glucose measurements forecast future glucose levels?

with:

> Can 48 five-minute multimodal observations forecast the next six glucose
> values at five-minute intervals?

### Slide 6: Title Justification — SMALL CHANGE

Replace the GRU explanation with:

> Forecasting Using Multimodal GRU: The GRU learns temporal relationships from
> CGM, insulin, carbohydrate, time-of-day, and weekday features. It uses a
> four-hour history to directly predict six future glucose values over 30
> minutes.

The Digital Twin, RAG, and MCP explanations can remain.

### Slide 7: Objectives — REPLACE FORECAST OBJECTIVES

Use these model-related objectives:

- Develop a multimodal GRU glucose forecasting model.
- Use 48 historical readings at five-minute resolution.
- Combine CGM, basal insulin, bolus insulin, carbohydrates, and temporal features.
- Directly forecast six future glucose values at +5 to +30 minutes.
- Detect possible low and high glucose conditions.
- Display history, forecast, alerts, recommendations, and chatbot guidance.
- Avoid diagnosis and medication prescription.

Remove the objectives saying age and sex are model features and that the model
forecasts approximately three hours.

### Slide 8: Scope — SMALL CHANGE

Keep the scope and safety limitations. Add:

> The current multimodal model uses numeric carbohydrate and insulin fields when
> available. Sparse optional fields such as exercise, heart rate, and wearable
> physiological signals are not included in this model version.

### Slide 9: Introduction — SMALL CHANGE

Keep the background and problem statement. Add:

> A multimodal forecasting approach is used because glucose changes are
> influenced by both the recent CGM trajectory and available insulin and
> carbohydrate events.

### Slides 10–14: Existing Technologies — SMALL CHANGES

These slides are comparative background and do not require a complete rewrite.

On Slide 10, change the GRU input to:

> Input: A sequence of 48 five-minute observations containing CGM, basal
> insulin, bolus insulin, carbohydrates, time-of-day features, and weekday
> features.

On Slide 11, change the LSTM comparison to:

> LSTM can also process multimodal glucose, insulin, and meal-related
> sequences, but the proposed implementation selects GRU for a simpler and
> efficient short-horizon model.

On Slide 12, change the traditional ML input description to:

> Engineered statistical, glucose, insulin, carbohydrate, and temporal features.

Slides 13 and 14 can remain unchanged.

### Slide 15: Research Comparison — SMALL CHANGE

Keep the integration list. Add:

> The forecasting component uses multimodal physiological and treatment-related
> inputs rather than glucose-only input.

### Slide 16: Comparison of Existing Approaches — REPLACE TABLE ROW

Update the proposed-system row:

| Approach | Main input | Main output | Limitation |
|---|---|---|---|
| Proposed system | CGM, insulin, carbohydrates, temporal features, RAG, and patient tools | Six-step 30-minute forecast, alerts, simulation, and guidance | Research prototype; not clinically validated |

Update the GRU row:

| GRU | Multimodal 48-step sequence | Direct multi-step forecast | Requires quality aligned time-series data |

### Slide 17: Literature Comparison — SMALL CHANGE

Update the proposed-system row to:

> GRU + RAG + MCP-style tools | MetaboNet CGM, insulin, carbohydrate, and
> temporal features | Multimodal short-term forecasting and integrated
> personalization | Holdout result; not clinically validated

### Slide 18: Technology Comparison Summary — SMALL CHANGE

Replace the GRU sentence with:

> A multimodal GRU is selected for five-minute glucose time-series forecasting.
> It uses 48 historical observations and directly predicts six future values
> over 30 minutes.

The rule-based risk, RAG, Gemini, MCP, React, and FastAPI statements can remain.

### Slides 19–27: Gap, SDLC, UML, and Requirements — MOSTLY UNCHANGED

Slides 19–25 do not need model-content changes. Update diagram labels if they
say `glucose-only`, `age`, `sex`, `15-minute`, or `three-hour`.

On Slide 26, update the requirement:

> Generate multimodal six-step GRU forecasts from aligned CGM, insulin,
> carbohydrate, and temporal features.

On Slide 27, add:

> Data quality: The system must handle missing CGM and sparse event fields
> explicitly and must not silently treat an unavailable clinical measurement as
> a confirmed event.

### Slide 28: Dataset Description — REPLACE ENTIRE SLIDE

Use:

> Dataset: MetaboNet consolidated Type 1 diabetes dataset
>
> Files: `train.parquet` and `test.parquet`
>
> Standardized columns: 37
>
> Sampling: One row per five-minute interval
>
> Train file: 132,811,004 rows
>
> Test file: 22,069,548 rows
>
> Core fields: CGM, basal insulin, bolus insulin, total insulin, carbohydrates
>
> Additional fields: demographics, devices, treatment metadata, exercise, and
> optional physiological signals
>
> Important note: Feature availability differs by source dataset. Sparse fields
> were not all used in the current model.

Add a small table or diagram showing:

> `train.parquet` -> preprocessing -> training/validation  
> `test.parquet` -> holdout evaluation

### Slide 29: Data Preparation — REPLACE

Use:

> Stage 1: Read Parquet data in patient streams to avoid loading the complete
> dataset into memory.
>
> Stage 2: Form patient keys using `source_file:id` so repeated IDs from
> different source studies remain separate.
>
> Stage 3: Sort each patient stream by timestamp and aggregate on the
> five-minute timeline.
>
> Stage 4: Validate CGM values, interpolate gaps up to 30 minutes, and preserve
> sparse insulin and carbohydrate events.
>
> Stage 5: Create 48-step input windows and six-step future targets.

### Slide 30: Feature Scaling and Dataset Splitting — REPLACE

Use:

> Model features, in order:
>
> 1. CGM glucose
> 2. Basal insulin
> 3. Bolus insulin
> 4. Carbohydrates
> 5. Time-of-day sine
> 6. Time-of-day cosine
> 7. Weekday sine
> 8. Weekday cosine
>
> Model input: 48 time steps x 8 features = four hours of history.
>
> Target: 6 future CGM values at five-minute intervals = 30 minutes.
>
> Processing: Fit the scaler only on the training portion, preserve time order,
> and evaluate on the separate test file.

### Slides 31–32: Proposed Model and Internal Architecture — REPLACE LABELS

Update the diagrams to show:

> `train.parquet/test.parquet`
> -> streaming patient grouping
> -> five-minute alignment and cleaning
> -> 8-feature construction
> -> leakage-safe scaling
> -> 48 x 8 GRU input
> -> GRU hidden representation
> -> direct six-output prediction head
> -> +5 to +30 minute glucose forecast
> -> risk classification, dashboard, alerts, and chatbot

Do not show a recursive prediction loop for the current model.

### Slide 33: Modules of Proposed Model — REPLACE MODULE 1 AND 2

Module 1:

> Data Collection: Read the MetaboNet train and test Parquet files. The files
> contain five-minute rows with CGM, insulin, carbohydrate, demographic,
> device, activity, and study metadata.

Module 2:

> Data Preprocessing: Stream patient data, validate CGM values, interpolate
> short CGM gaps, fill missing insulin/carbohydrate values with zero, construct
> temporal features, scale without leakage, and create 48-to-6 windows.

### Slide 34: Modules of Proposed Model — REPLACE MODULE 3

Module 3:

> GRU Forecasting: Receives a 48 x 8 sequence representing four hours of
> history and directly predicts six future glucose values at five-minute
> intervals.

Keep the risk, dashboard, and LLM/RAG/MCP modules, but state that forecast
guidance is based on predicted low/high classifications and is not a treatment
instruction.

### Slide 35: GRU Algorithm — REPLACE ENTIRE SLIDE

Use:

> Input: 48 historical time steps x 8 features.
>
> Output: Six direct future glucose predictions.
>
> 1. Read patient streams from Parquet.
> 2. Sort observations chronologically.
> 3. Validate CGM and align observations to five-minute intervals.
> 4. Construct CGM, insulin, carbohydrate, and temporal features.
> 5. Fit the scaler only on the training portion.
> 6. Create 48-step input windows and six-step targets.
> 7. Pass each window through the GRU.
> 8. Use the output head to predict six glucose values simultaneously.
> 9. Calculate training and validation loss.
> 10. Evaluate MAE, RMSE, and R-squared on holdout windows.

Replace “recursive future predictions” with “direct multi-step prediction.”

### Slide 36: Risk Classification Algorithm — SMALL CHANGE

The threshold table can remain:

| Glucose | Classification |
|---|---|
| `< 54 mg/dL` | Level 2 hypoglycemia |
| `54–69 mg/dL` | Level 1 hypoglycemia |
| `70–180 mg/dL` | Target range |
| `181–250 mg/dL` | Level 1 hyperglycemia |
| `> 250 mg/dL` | Level 2 hyperglycemia |

Add:

> The same classification is applied to forecast values to mark possible future
> risk. Forecast warnings require confirmation with an approved glucose check
> and do not prescribe insulin or medication changes.

### Slide 37: Results: Model Performance — REPLACE ENTIRE SLIDE

Use these values:

> MetaboNet multimodal GRU holdout evaluation
>
> 100,000 evaluated holdout windows
>
> MAE: 10.3405 mg/dL
>
> RMSE: 15.3403 mg/dL
>
> R-squared: 0.9128
>
> Input: 48 readings = 4 hours
>
> Output: 6 readings = 30 minutes
>
> Forecast steps: +5, +10, +15, +20, +25, and +30 minutes

Use the caption:

> Metrics are calculated on a 100,000-window sample from the separate
> `test.parquet` holdout file. They are not metrics from the complete
> 22-million-row test file and should not be presented as clinical validation.

Replace the old values `6.4427`, `11.5862`, `0.97575`, `3,365,788`, and
`12 points / 3 hours`.

### Slide 38: Results: Forecast Example — REPLACE

Use:

> The multimodal GRU produces six direct predictions at five-minute intervals.
> The forecast graph compares the recent four-hour measured history with the
> predicted next 30 minutes. Predicted low or high values are marked with the
> configured risk classification. The future values are estimates and are not
> confirmed CGM measurements.

Use a new figure generated from the current `test.parquet` evaluation or the
application output. Do not reuse a graph labelled “next three hours” or
“recursive forecast.”

### Slide 39: Results: Dashboard Interface — SMALL CHANGE

Keep the dashboard list. Add:

> The forecast panel shows six five-minute prediction points for the next 30
> minutes and indicates possible low/high forecast risk.

Use a current screenshot from:

> `http://127.0.0.1:8000/app`

### Slides 40–41: Low and High Alerts — SMALL CHANGE

These examples can remain as current-reading alert examples. Add a label:

> Example of threshold-based current-reading alert; not a measured result from
> the forecasting evaluation.

If replacing the screenshots, show that forecast warnings use the same
threshold categories but are clearly labelled as predictions.

### Slide 42: Results: Forecast Graph — REPLACE HORIZON TEXT

Replace:

> Historical glucose measurements up to the current time. Predicted glucose
> values after the current time.

with:

> The graph displays the latest four hours of measured history followed by six
> predicted glucose values at +5, +10, +15, +20, +25, and +30 minutes. The
> historical section contains measured values. The future section contains
> model predictions and is not a confirmed CGM measurement.

### Slide 43: Patient Digital Twin — NO MODEL CHANGE

Keep the Digital Twin components. If the diagram mentions the old model,
rename it to:

> MetaboNet multimodal GRU forecast

### Slide 44: What-If Simulation — SMALL CHANGE

Keep the simulation explanation and limitation. Add:

> The baseline and hypothetical paths use the configured multimodal forecasting
> boundary. The simulation is a mathematical comparison and does not prove that
> a meal, insulin dose, or other intervention will cause the displayed result.

### Slide 45: Chatbot, RAG, and MCP — SMALL CHANGE

Keep the existing chatbot capability list. Replace:

> Reads GRU forecast.

with:

> Reads the six-step MetaboNet multimodal forecast and its possible risk
> classifications.

Add:

> For a predicted low or high value, the chatbot recommends verifying the trend
> with an approved glucose check and following the clinician-approved plan. It
> does not prescribe insulin or medication changes.

### Slide 46: Timeline — NO MODEL CONTENT CHANGE

Keep the timeline. If training is shown, label it:

> MetaboNet streaming preprocessing and multimodal GRU training

### Slide 47: Conclusion and Future Work — REPLACE CONCLUSION

Use:

> This project developed an AI-driven Diabetes Digital Twin for personalized
> glucose monitoring and short-term forecasting. The current forecasting
> component is a multimodal GRU trained on MetaboNet five-minute data. It uses
> CGM, basal insulin, bolus insulin, carbohydrates, and temporal features. With
> 48 historical readings as input, it directly predicts six future glucose
> values over the next 30 minutes. The application provides historical
> visualization, threshold-based risk classification, forecast warnings,
> what-if simulation, RAG-based safety guidance, MCP-style patient tools, and a
> safety-constrained chatbot. The holdout sample result was MAE 10.3405 mg/dL,
> RMSE 15.3403 mg/dL, and R-squared 0.9128. The system is a research and
> decision-support prototype, not a clinical diagnostic or treatment system.

Update future work to:

- Evaluate the complete test file when sufficient compute resources are
  available.
- Perform a strictly patient-independent evaluation.
- Add per-horizon metrics for +5 through +30 minutes.
- Add confidence intervals and clinically reviewed error-grid analysis.
- Improve use of sparse exercise and wearable features when coverage permits.
- Add reliable insulin and carbohydrate capture in the client and CGM/vendor
  integrations.
- Improve RAG with reviewed and versioned clinical sources.
- Conduct external, clinical, privacy, and regulatory evaluation.

Remove “Add insulin and meal data” from future work because numeric insulin and
carbohydrate features are already used by the current model. They may remain
as a future-work item only for improving live data capture and completeness.

### Slides 48–49: References / Closing — CHECK

Keep the closing slide. Update references to include:

- The MetaboNet paper and dataset documentation.
- The source of the five-minute consolidated Parquet data.
- The GRU forecasting references already used.
- The safety/threshold reference already cited in the presentation.

Do not cite the old T1DiabetesGranada dataset as the current training dataset.

## 4. Files containing the authoritative values

Use the project files below when preparing figures and checking numbers:

- `results/metabonet_metrics.json` — current holdout metrics
- `results/metabonet_training_config.json` — current training configuration
- `scripts/metabonet_preprocessing.py` — feature names and preprocessing rules
- `scripts/metabonet_stream.py` — streaming data and leakage-safe scaler logic
- `scripts/train_metabonet.py` — training behavior
- `scripts/evaluate_metabonet.py` — evaluation behavior
- `models/best_metabonet_gru_model.pth` — active model checkpoint
- `scalers/metabonet_scaler.pkl` — matching scaler
- `backend/config.py` — active default model paths

## 5. Final presentation checklist

Before submitting the presentation:

- [ ] Replace the old dataset name and file names.
- [ ] Replace every mention of age/sex as model inputs.
- [ ] Replace 15-minute and three-hour forecast claims.
- [ ] Use 48 readings = four hours and six outputs = 30 minutes.
- [ ] Show the eight selected model features.
- [ ] Replace all old metrics with the current holdout metrics.
- [ ] Label the result as a 100,000-window holdout sample.
- [ ] Do not claim complete unseen-patient generalization.
- [ ] Do not claim all 37 columns were used as model inputs.
- [ ] Do not call predictions confirmed CGM measurements.
- [ ] Keep the non-diagnosis and non-prescription safety statements.
- [ ] Add a current dashboard screenshot and current forecast graph.
- [ ] Ensure chatbot slides mention forecast-aware low/high guidance.
- [ ] Update references from T1DiabetesGranada to MetaboNet.

## 6. Current second-model presentation images

The following valid figures are already generated:

- `plots/metabonet_training_validation_loss.png` — use on the model-training
  or results slide.
- `plots/metabonet_metrics_summary.png` — use on the model-performance slide.

The following evaluation figures require the original `test.parquet` file and
must not be recreated from the old first-model `predictions.csv`:

- `plots/metabonet_actual_vs_predicted.png`
- `plots/metabonet_glucose_trajectory.png`
- `plots/metabonet_prediction_error_distribution.png`
- `plots/metabonet_forecast_example.png`

After restoring `test.parquet`, generate all second-model figures with:

```powershell
.\.venv\Scripts\python.exe scripts\plot_metabonet_results.py `
  --project-dir . `
  --test-parquet C:\path\to\test.parquet `
  --max-sequences 100000
```

The plotting script is
`scripts/plot_metabonet_results.py`. It uses the second-model checkpoint and
scaler and produces six-step, five-minute-horizon figures. Until the Parquet
file is restored, only the training-loss and metric-summary images are
available as verified second-model figures.
