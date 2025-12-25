# PowerShell script to set up backend environment
# Run this script: .\setup.ps1

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

Write-Host "Backend setup complete! To activate the virtual environment, run: .\venv\Scripts\Activate.ps1" -ForegroundColor Green

