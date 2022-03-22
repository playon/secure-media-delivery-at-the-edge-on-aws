
Write-Output "Install node dependencies"
npm install

Write-Output "Install NodeJs dependencies for AWS Lambda"
Set-Location .\lambda\layers\aws_secure_media_delivery_nodejs\nodejs
npm install
Set-Location ..\..\..\..\

Write-Output "Create create a virtualenv"
python -m venv .venv

Write-Output "Activate your virtualenv"
.venv\Scripts\Activate.ps1

Write-Output "Install Python dependencies for AWS Lambda"
pip install -r .\lambda\layers\jsonpath\requirements.txt -t .\lambda\layers\jsonpath\python

deactivate
