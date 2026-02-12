import express from 'express';
import path from 'path';

// Import the API app
import apiApp from '../api/index';

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use(apiApp);

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`
============================================================
  Supervisor Responsiveness Profile
============================================================

  Server running at http://0.0.0.0:${PORT}

  Features:
    - Build profiles from Legistar API, county websites, web search
    - Visualize data availability gaps
    - Sample profile for Chris Lopez (Monterey County)

  API:
    POST /api/profile        Build a profile (live data)
    GET  /api/profile/sample Load the sample profile

============================================================
`);
});
