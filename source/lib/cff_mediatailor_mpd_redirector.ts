function handler(event) {
    var response = event.response;
    var location = response.headers['location'];
    if(location){
        location.value = (location.value.startsWith('/')?'../../../..':'../../../../') + location.value; 
    }
     return response;
 }