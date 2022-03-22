
var videoHls = document.getElementById('videoPlayer');
var hls = new Hls();
var playerDash = dashjs.MediaPlayer().create();

var dash_initialized = false;

var getLocation = function (href) {
  var l = document.createElement("a");
  l.href = href;
  return l;
};

if (!library)
  var library = {};

library.json = {
  replacer: function (match, pIndent, pKey, pVal, pEnd) {
    var key = '<span class=json-key>';
    var val = '<span class=json-value>';
    var str = '<span class=json-string>';
    var r = pIndent || '';
    if (pKey)
      r = r + key + pKey.replace(/[": ]/g, '') + '</span>: ';
    if (pVal)
      r = r + (pVal[0] == '"' ? str : val) + pVal + '</span>';
    return r + (pEnd || '');
  },
  prettyPrint: function (obj) {
    var jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
    return JSON.stringify(obj, null, 3)
      .replace(/&/g, '&amp;').replace(/\\"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(jsonLine, library.json.replacer);
  }
};

function playHLS(url) {
  console.log("PLAY HLS");
  console.log(playerDash.isReady());
  if(dash_initialized){
      playerDash.reset();
  }


    // bind them together
    hls.attachMedia(videoHls);
    hls.on(Hls.Events.MEDIA_ATTACHED, function () {
      console.log('video and hls.js are now bound together !');
      hls.loadSource(url);
      hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
        console.log(
          'manifest loaded, found ' + data.levels.length + ' quality level'
        );
      });

      videoHls.play();
    });

}

function playDASH(url) {
  console.log("PLAY DASH");
  console.log(playerDash.isReady());
  dash_initialized = true;
  hls.detachMedia();
  console.log(document.querySelector("#videoPlayer"));
  playerDash.initialize(document.querySelector("#videoPlayer"), url, true);
}

function load(type) {
  console.log("TYPE="+type);
  //$("#videoPlayer").text('');
  $("#request_url_value").text('');
  $("#playback_url_value").text('');
  $('#jwt_header').text('');
  $('#jwt_payload').html('');

  var idAsset = type=='hls' ? 1 : 2;
  var urlToGet = `${location.protocol}\/\/${location.hostname}/tokengenerate?id=` + idAsset;
  console.log(urlToGet);

  var user = $("#inputUsername").val();
  var pass = $("#inputPassword").val();

  $.ajax({
    type: 'POST',
    url: urlToGet,
    headers: {
      "Authorization": "Basic " + btoa(user + ":" + pass)
    },
    success: function (data, status, xhr) {
      console.log("success");


      $("#result").removeClass('d-none');

      $("#login").addClass('d-none');
      //$("#login").text('');
      $("#errorMsg").addClass('d-none');
      $("#errorAsset").addClass('d-none');

      $("#request_url_value").text(urlToGet);
      $("#playback_url_value").text(data);

      var manifest_url = data;

      var l = getLocation(manifest_url);
      var tokens = l.pathname.substring(1, l.pathname.indexOf('/', 1)).split(".");

      $('#jwt_header').html(library.json.prettyPrint(JSON.parse(atob(tokens[1]))));
      $('#jwt_payload').html(library.json.prettyPrint(JSON.parse(atob(tokens[2]))));

      if(type=='hls'){
        playHLS(manifest_url);
      }else{
        playDASH(manifest_url);
      }



    },
    error: function (data, status, xhr) {
      console.log("ERROR Ajax");
      console.log("DATA="+data);

      $("#errorMsg").removeClass('d-none');

      if(data.status == 401){
        //error authentication
        $("#login").removeClass('d-none');
        $("#errorMsg").text("Authentication failed!");

        $('#submit').prop('disabled', false);
        $("#submit").text("Sign in");


      }else if(data.status == 404){
        //not found
        $("#errorAsset").text("Video asset not configured!");
        $("#errorAsset").removeClass('d-none');

        $("#login").addClass('d-none');
        $("#result").removeClass('d-none');

      }else {
        //different error
        $("#errorAsset").text("Unknown error!");
        $("#errorAsset").removeClass('d-none');

        $("#login").addClass('d-none');
        $("#result").removeClass('d-none');

      }



      destroyPlayers();



      //player.reset();
      $("#request_url_value").text('');
      $("#playback_url_value").text('');

    }
  });


}

function destroyPlayers(){
  hls.detachMedia();
  if(dash_initialized){
    playerDash.reset();
}

}
$('#hls').on('change', function () {
  console.log("HLS pressed");
  load('hls');

});

$('#dash').on('change', function () {
  console.log("DASH pressed");
  load('dash')

});

console.log();

