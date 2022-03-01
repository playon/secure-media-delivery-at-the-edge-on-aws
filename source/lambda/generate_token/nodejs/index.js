
console.log('Loading function');

exports.lambda_handler = async (event, context) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    return {
        'statusCode': 202,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': JSON.stringify("OK from nodejs")
    }
};
