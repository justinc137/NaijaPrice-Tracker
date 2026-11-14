"""
NaijaPrice Tracker - Standalone Streamlit Application
Built with Python, Streamlit, Pandas, Plotly, and Scikit-learn.
Run locally via:
    pip install -r requirements.txt
    streamlit run streamlit_app.py
"""

import os
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, root_mean_squared_error
from sklearn.preprocessing import OneHotEncoder

st.set_page_config(
    page_title="NaijaPrice Tracker | Nigerian Agricultural Market Intelligence",
    layout="wide",
)

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "nigerian_commodity_prices.csv")


@st.cache_data
def load_data(uploaded_file=None) -> pd.DataFrame:
    if uploaded_file is not None:
        df = pd.read_csv(uploaded_file)
    else:
        df = pd.read_csv(DATA_FILE)
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month
    return df.sort_values("date")


def decompose_seasonality(series_df: pd.DataFrame) -> pd.DataFrame:
    df = series_df.copy().sort_values("date")
    df["trend"] = df["price_ngn"].rolling(window=12, center=True, min_periods=6).mean()
    df["trend"] = df["trend"].bfill().ffill()
    df["seasonal_ratio"] = df["price_ngn"] / df["trend"]
    monthly_idx = df.groupby("month")["seasonal_ratio"].mean()
    monthly_idx = monthly_idx / monthly_idx.mean()
    df["seasonal_index"] = df["month"].map(monthly_idx)
    df["residual"] = df["price_ngn"] / (df["trend"] * df["seasonal_index"])
    return df, monthly_idx


def train_and_forecast(series_df: pd.DataFrame, horizon_months: int, alpha: float = 0.25):
    df = series_df.copy().sort_values("date").reset_index(drop=True)
    df["t"] = np.arange(len(df)) / max(len(df), 1)
    df["y_log"] = np.log(df["price_ngn"])

    encoder = OneHotEncoder(categories=[list(range(1, 13))], drop="first", sparse_output=False)
    month_dummies = encoder.fit_transform(df[["month"]])
    X = np.hstack([df[["t"]].values, month_dummies])
    y = df["y_log"].values

    # Holdout 6-month backtest
    holdout = min(6, max(3, len(df) // 5))
    bt_model = Ridge(alpha=alpha)
    bt_model.fit(X[:-holdout], y[:-holdout])
    bt_pred = np.exp(bt_model.predict(X[-holdout:]))
    actual = df["price_ngn"].values[-holdout:]

    metrics = {
        "MAE": mean_absolute_error(actual, bt_pred),
        "RMSE": root_mean_squared_error(actual, bt_pred),
        "MAPE": mean_absolute_percentage_error(actual, bt_pred) * 100,
    }

    # Full fit + future forecast
    model = Ridge(alpha=alpha)
    model.fit(X, y)
    df["fitted_ngn"] = np.exp(model.predict(X))
    sigma = np.std(y - np.log(df["fitted_ngn"]))

    last_date = df["date"].max()
    future_dates = [last_date + pd.DateOffset(months=i) for i in range(1, horizon_months + 1)]
    future_df = pd.DataFrame({"date": future_dates})
    future_df["month"] = future_df["date"].dt.month
    future_df["t"] = np.arange(len(df), len(df) + horizon_months) / max(len(df), 1)

    X_future = np.hstack([future_df[["t"]].values, encoder.transform(future_df[["month"]])])
    pred_log = model.predict(X_future)
    h_steps = np.arange(1, horizon_months + 1)
    band = 1.96 * sigma * np.sqrt(1.0 + h_steps / 10.0)

    future_df["predicted_ngn"] = np.exp(pred_log)
    future_df["lower95_ngn"] = np.exp(pred_log - band)
    future_df["upper95_ngn"] = np.exp(pred_log + band)
    return df, future_df, metrics


def main():
    st.title("NaijaPrice Tracker")
    st.caption("Nigerian Agricultural Commodity Price Trends, Seasonality Detection & Scikit-Learn Forecasting")

    uploaded = st.sidebar.file_uploader("Upload Custom Market CSV (optional)", type=["csv"])
    df = load_data(uploaded)

    commodity = st.sidebar.selectbox("Commodity", sorted(df["commodity_name"].unique()))
    market = st.sidebar.selectbox("Market", sorted(df["market_name"].unique()))
    horizon = st.sidebar.slider("Forecast Horizon (Months)", min_value=1, max_value=12, value=6)
    alpha = st.sidebar.slider("Ridge Regularization (alpha)", min_value=0.05, max_value=2.0, value=0.25, step=0.05)

    sub = df[(df["commodity_name"] == commodity) & (df["market_name"] == market)]
    decomp_df, monthly_idx = decompose_seasonality(sub)
    hist_df, fc_df, metrics = train_and_forecast(decomp_df, horizon, alpha=alpha)

    c1, c2, c3, c4 = st.columns(4)
    latest_price = hist_df["price_ngn"].iloc[-1]
    prev_price = hist_df["price_ngn"].iloc[-2]
    yoy_price = hist_df["price_ngn"].iloc[-13] if len(hist_df) >= 13 else hist_df["price_ngn"].iloc[0]
    c1.metric("Latest Price", f"₦{latest_price:,.0f}", f"{((latest_price - prev_price) / prev_price) * 100:+.1f}% MoM")
    c2.metric("Year-over-Year", f"{((latest_price - yoy_price) / yoy_price) * 100:+.1f}%")
    c3.metric("Backtest MAPE", f"{metrics['MAPE']:.2f}%", f"RMSE ₦{metrics['RMSE']:,.0f}")
    c4.metric(f"{horizon}-Mo Projection", f"₦{fc_df['predicted_ngn'].iloc[-1]:,.0f}")

    fig = go.Figure()
    fig.add_trace(go.Scatter(x=hist_df["date"], y=hist_df["price_ngn"], name="Observed Price (₦)", line=dict(color="#0F172A", width=2.5)))
    fig.add_trace(go.Scatter(x=hist_df["date"], y=hist_df["trend"], name="12-Mo Trend", line=dict(color="#64748B", dash="dot")))
    fig.add_trace(go.Scatter(x=fc_df["date"], y=fc_df["predicted_ngn"], name="Ridge Forecast", line=dict(color="#16A34A", width=2.5, dash="dash")))
    fig.add_trace(go.Scatter(
        x=pd.concat([fc_df["date"], fc_df["date"][::-1]]),
        y=pd.concat([fc_df["upper95_ngn"], fc_df["lower95_ngn"][::-1]]),
        fill="toself",
        fillcolor="rgba(22, 163, 74, 0.14)",
        line=dict(color="rgba(255,255,255,0)"),
        name="95% Confidence Band",
    ))
    fig.update_layout(title=f"{commodity} — {market}", yaxis_title="Price (₦ NGN)", template="plotly_white")
    st.plotly_chart(fig, use_container_width=True)

    col_left, col_right = st.columns(2)
    with col_left:
        season_plot = pd.DataFrame({
            "Month": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            "Deviation (%)": [(monthly_idx.get(m, 1.0) - 1.0) * 100 for m in range(1, 13)],
        })
        fig_s = px.bar(season_plot, x="Month", y="Deviation (%)", title="12-Month Seasonal Price Index Deviation")
        st.plotly_chart(fig_s, use_container_width=True)

    with col_right:
        latest_dt = df["date"].max()
        arb = df[(df["commodity_name"] == commodity) & (df["date"] == latest_dt)].sort_values("price_ngn")
        st.subheader("Cross-Market Price Comparison")
        st.dataframe(arb[["market_name", "state", "region", "price_ngn"]], use_container_width=True)

    st.download_button(
        "Download Forecast & Historical CSV",
        data=pd.concat([hist_df[["date", "price_ngn", "trend", "seasonal_index"]], fc_df]).to_csv(index=False),
        file_name=f"naijaprice_{commodity.lower().replace(' ', '_')}.csv",
        mime="text/csv",
    )


if __name__ == "__main__":
    main()
