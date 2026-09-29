Frozen copies of the two pre-refactor browser scripts (`app.js`, `ee-app.js`) and their data (`majors-data.js`).
They are no longer served. `tests/helpers/legacy.js` runs them in a Node vm sandbox so the recorded golden fixtures in `tests/golden/`
and the data converter can still be regenerated and checked. Do not edit them; the new planner lives in `src/`.
