# Mobile client

This is the Android-first React Native/Expo client for the Diabetes Digital
Twin backend. It uses the same patient-scoped APIs as the web dashboard.

## Run locally

Start the backend from the project root:

```powershell
..\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Install and start Expo:

```powershell
npm install
npm run start
```

For a physical Android device, `API_URL` in `App.js` must use the computer's
current LAN IPv4 address. The Android emulator uses `10.0.2.2` instead.

The mobile client supports:

- dashboard state, risk, recommendations, and alerts
- native glucose trend graph with recorded and forecast points
- glucose history
- GRU forecast and what-if simulation
- safety chatbot and saved conversation
- vendor-neutral CGM connection registration
- SecureStore-backed bearer-token storage for production authentication
- audible Android notifications for current and forecast glucose alerts

The backend still needs a real identity-provider login flow before a public
release. Local development can continue to use the prototype patient header.
Registering a CGM account does not by itself connect to hardware: a
provider-approved OAuth/BLE/webhook adapter must be configured for the chosen
CGM vendor. Once configured, normalized signed webhook events update the
patient's current glucose, graph, alerts, forecast, and chatbot context.
High and critical current/forecast alerts produce an audible notification and
vibration when the app is open or refreshing data. Background alerts while the
app is closed require registering an Expo push token and delivering it from the
backend; local notifications alone cannot run after the app process stops.
