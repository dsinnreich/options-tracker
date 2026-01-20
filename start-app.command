#!/bin/bash
# Options Tracker Launcher

cd "$(dirname "$0")"

echo "🚀 Starting Options Tracker..."
echo ""
echo "Backend will run on: http://localhost:3001"
echo "Frontend will run on: http://localhost:5173"
echo ""
echo "Your browser will open automatically..."
echo ""
echo "Press Ctrl+C to stop the app"
echo "----------------------------------------"
echo ""

# Start the app
npm run dev &

# Wait for servers to start
sleep 5

# Open browser
open http://localhost:5173

# Keep terminal open
wait
