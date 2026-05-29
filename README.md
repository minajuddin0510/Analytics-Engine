# NetTheta

A professional BTC Options Selling Net Profit Calculator built specifically for Delta Exchange traders.

NetTheta helps crypto option sellers accurately calculate:

* Gross Profit
* Entry & Exit Fees
* GST
* Net Profit
* Margin Used
* ROI %
* Exact Buyback Price required for a target NET return

Unlike generic calculators, NetTheta is designed around the actual Delta Exchange fee structure and premium-cap logic.

---

## Features

* Real-time calculations
* Accurate Delta Exchange fee logic
* Premium cap fee calculations
* GST calculations
* Margin & leverage calculations
* NET profit focused analysis
* Smart target exit engine
* Modern responsive UI
* Professional trading dashboard design

---

## Built For

This project is designed for:

* BTC option sellers
* Theta traders
* Crypto derivatives traders
* Delta Exchange users

Especially traders who focus on:

* net profitability
* premium decay
* leverage efficiency
* accurate fee-adjusted exits

---

## Core Calculation Logic

### Notional Value

```text
Notional Value =
Lots × 0.001 × BTC Price
```

### Standard Trading Fee

```text
Standard Fee =
Notional Value × 0.01%
```

### Premium Cap Fee

```text
Premium Cap Fee =
3.5% × Lots × 0.001 × Option Premium
```

### Effective Fee

```text
Effective Fee =
MIN(Standard Fee, Premium Cap Fee)
```

### Final Fee Including GST

```text
Final Fee =
Effective Fee × 1.18
```

---

## Profit Calculation

### Gross Profit

```text
Gross Profit =
(Sell Premium - Buy Premium)
× Lots
× 0.001
```

### Net Profit

```text
Net Profit =
Gross Profit - Total Fees
```

### ROI %

```text
ROI % =
(Net Profit ÷ Margin Used) × 100
```

---

## Smart Exit Engine

One of the main features of NetTheta is the reverse-calculation engine.

The system automatically calculates:

> "What exact buyback premium is required to achieve a NET +5% ROI after all fees and GST?"

This helps traders avoid manual calculations and improve execution precision.

---

## Tech Stack

* HTML
* CSS
* Vanilla JavaScript

No frameworks used.

---

## Branding

Built under:

**Minaj Enterprises**

---

## Disclaimer

This project is independently built for analytical and educational purposes only.

It is not affiliated with or endorsed by Delta Exchange.

Always verify fee structures and market conditions before trading.

---

## Author

MD. Minaj Uddin

GitHub:
minajuddin0510
