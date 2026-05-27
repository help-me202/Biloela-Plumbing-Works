# Run this script from the project folder in PowerShell AFTER installing Git for Windows
# It stages and commits the server.js change.

git add server.js
git commit -m "Serve static files from project root (express.static) in server.js"

git status
