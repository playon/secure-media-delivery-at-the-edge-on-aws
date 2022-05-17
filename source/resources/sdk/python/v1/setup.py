from setuptools import setup
  
setup(
    name="aws_secure_media_delivery",
    version="1.0.0",
    description='Python SDK for AWS Secure Media Delivery',
    py_modules=["aws_secure_media_delivery"],
    python_requires='>=3.9',
    install_requires=[
        'PyJWT',
        'boto3',
        'cachetools'
    ],
)
