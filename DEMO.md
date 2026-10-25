# A three-minute Kaafila demo

## 1. Start with the flood example

Open the disruption desk. The first case is an 18-hour fresh-milk delay affecting Patiala and Ambala. Run the investigation.

- Eight stores are at risk; earliest stockout is about 4.5 hours away.
- Estimated retail sales exposure is ₹56,640.
- The recommended store transfer allocates 944 packs, costs an incremental ₹3,588, and protects an estimated ₹56,640 of retail sales within the model assumptions.
- Open the inventory evidence to see the calculation. Patiala Central has 50 packs and demand of 11.2 packs/hour. Its 18-hour shortage is ceil(11.2 × 18 − 50) = 152 packs, or ₹9,120 of exposure.

These numbers are synthetic and represent retail sales exposure, not profit.

## 2. Show that the system changes its recommendation

Choose **A short delay, enough stock** and investigate. All four stores cover the three-hour bread delay. The system recommends keeping the scheduled delivery, with ₹0 additional cost.

Then try **Cold-chain temperature breach**. Expediting the original shipment is excluded because compromised stock cannot be made safe by a faster route.

## 3. Demonstrate our own model

Choose **New alert** and paste this into “What happened?”:

> Rice demand has surged 2.4x in Chandigarh and Ludhiana. Replenishment is 24 hours away.

Click **Interpret with AlertNet**. It should identify demand surge, rice, Chandigarh and Ludhiana, 24 hours and a 2.4× demand multiplier. Review the editable fields and investigate.

Other examples:

> The refrigeration failed and the milk cargo is unsafe in Patiala. Replacement supply is 18 hours away.

> The supplier cancelled medicine kits for Karnal and Panipat. Replacement stock will arrive in 30 hours.

> Our bread truck is running late in Ludhiana. It will arrive in 3 hours.

> Flood water has blocked milk deliveries to Ambala. Supply will resume in 24 hours.

An ambiguity example:

> Milk and bread are delayed in Patiala. The truck departed 3 hours ago and will arrive in 8 hours.

The model should flag multiple products and conflicting time periods. Select one product and explicitly confirm the replenishment gap.

## 4. Finish with the decision trail

Open **Evidence room** and inspect **Custom model interpretation**. Explain that AlertNet is a compact, trained classifier; all quantities, costs and risk calculations come from code.

Review and approve a plan. Then inspect **Decision log** and export the case report. An alternative plan requires a manager reason. Approval is a local record only; it does not execute an order.

## Honest pitch

“Kaafila turns a retail disruption into an investigated, priced and reviewable decision. Our own alert classifier understands the event and product, inventory tools find exposed stores, and a transparent risk engine compares feasible recovery plans. Managers can inspect the evidence and make the final call.”

The demo uses 24 fictional stores, synthetic prices/stock/quotes, a schematic map and estimated travel times. The model has only been evaluated on synthetic English alerts. Optional current weather is separate live context. Real ERP data, calibrated forecasts, persistent multi-user records and supplier execution are future integrations.
