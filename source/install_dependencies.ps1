
Write-Output "Install node dependencies"
npm install

Write-Output "Install NodeJs ws_secure_media_delivery layer dependencie for AWS Lambda"
Set-Location .\lambda\layers\aws_secure_media_delivery_nodejs\nodejs
npm install
Set-Location ..\..\..\..\

Write-Output "Install NodeJs ZipLocal layer dependencie for AWS Lambda"
Set-Location .\lambda\layers\ziplocal\nodejs
npm install
Set-Location ..\..\..\..\

Write-Output "Create create a virtualenv"
python -m venv .venv

Write-Output "Activate your virtualenv"
.venv\Scripts\Activate.ps1

Write-Output "Install Python dependencies for AWS Lambda"
pip install -r .\lambda\layers\jsonpath\requirements.txt -t .\lambda\layers\jsonpath\python

Write-Output "Copy aws_secure_media_delivery python lib to AWS Lambda Layer"
Copy-Item .\resources\sdk\python\v1\aws_secure_media_delivery.py -Destination .\lambda\layers\aws_secure_media_delivery_python\python

Write-Output "Install aws_secure_media_delivery Python dependencies for AWS Lambda"
pip install -r .\lambda\layers\aws_secure_media_delivery_python\python\requirements.txt -t .\lambda\layers\aws_secure_media_delivery_python\python

deactivate
