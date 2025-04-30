# Aircraft Activity Visualizer

A React application to upload a CSV file containing aircraft landing data and visualize activity patterns.

## Features

*   Upload CSV files (must contain `time`, `icao24`, `airportId` columns).
*   Visualize:
    *   Top 20 most active airports.
    *   Top 20 most frequent airport-to-airport pairs.
    *   Landing activity by day of the week.
    *   Landing activity by hour of the day.
*   Filter activity charts by a specific airport.

## Setup

1.  **Navigate to the `frontend` directory:**
    ```bash
    cd frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```

## Running the Application

1.  **Start the development server:**
    ```bash
    npm start
    # or
    # yarn start
    ```
2.  Open your web browser and navigate to `http://localhost:3000` (or the port specified in the output).
3.  Click the "Upload CSV" button and select your data file (e.g., `visits.csv` from the parent directory, assuming it follows the required format).
4.  View the generated visualizations. Use the filter dropdown to focus on a specific airport's time-based activity.

## CSV Format

The uploaded CSV file must contain at least the following columns:

*   `time`: Timestamp of the landing (parsable by JavaScript's `new Date()`, e.g., ISO 8601 format like `2025-04-11T15:56:01.744Z`).
*   `icao24`: Unique identifier for the aircraft.
*   `airportId`: Identifier for the airport where the landing occurred.

Other columns like `callSign` will be ignored. The data will be sorted chronologically based on the `time` column before processing pairs. 