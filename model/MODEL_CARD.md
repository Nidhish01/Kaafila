# AlertNet 1.0 — model card

## Purpose and architecture

AlertNet is Kaafila's own supervised text classifier, trained from scratch. Two multinomial Naive Bayes heads predict the disruption type (weather, demand, supplier, cold-chain, delay) and product category (milk, bread, rice, medicine). Features combine word unigrams, word bigrams, and character trigrams. There are 2,045 learned vocabulary features. The exported model is approximately 234 KB and runs in TypeScript without an API key, Python server, pretrained model, or external inference service.

Cities, explicit durations and demand multipliers are extracted by rules. Structured fields confirmed by the manager control risk calculations. Predictions never directly order goods or change inventory.

## Training and reproducibility

The training corpus contains 2,560 synthetic English alerts, generated from 80 authored event phrases, 32 product descriptions, six cities and four sentence frames. The 640-example holdout uses 20 separate event phrase families and a different sentence frame. Model parameters are estimated from the training corpus with Laplace smoothing (alpha 0.5).

Run `python model/train.py` using Python 3.10 or newer. No third-party Python dependency is required. This regenerates the JSON model, training/holdout corpora, evaluation report and cross-language parity cases deterministically. SHA-256 of the model is recorded in `evaluation.json`.

## Evaluation

On this synthetic holdout, both heads classify 640/640 examples correctly. This is a template-based development check, **not an estimate of real-world accuracy**. The website's TypeScript predictor also matches Python on 40 exported parity cases. Additional tests cover an unseen demand prompt, cold-chain classification, multiple products, missing quantities, unsupported questions and negation.

The synthetic examples share domain vocabulary with training. Retailer-written messages, misspellings, multilingual alerts, vague messages, conflicting events and long narratives need separate representative evaluation before deployment with real operational data. No production retailer evaluation has been done.

## Scores, abstention and review

The UI calls scores model scores, not calibrated confidence. A temperature of 3 smooths the class scores; it does not calibrate them. A top score below 0.65, missing domain signals, unknown products, negation, multiple products or ambiguous durations triggers manual review. Product mentions serve as a scope check, not as a replacement for the learned classification head. All suggested fields remain editable. Missing values retain visible form defaults and are explicitly flagged for confirmation.

## Intended limitations

This is a narrow English classifier, not a generative or conversational language model. It does not browse news, learn automatically from manager overrides, infer verified road closures, assess medical safety, or predict demand from historical time series. Synthetic values and heuristic risk scores are demonstrations. Donor reserves, cost comparisons, supply allocations and sales exposure are computed by auditable code.
