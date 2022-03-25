
const videoHls = document.getElementById('videoPlayer');
const hls = new Hls();
const playerDash = dashjs.MediaPlayer().create();

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

  if (dash_initialized) {
    playerDash.reset();
  }

  // bind them together
  hls.attachMedia(videoHls);
  hls.on(Hls.Events.MEDIA_ATTACHED, function () {
    hls.loadSource(url);
    hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
    });

    videoHls.play();
  });

}

function playDASH(url) {
  dash_initialized = true;
  hls.detachMedia();
  playerDash.initialize(document.querySelector("#videoPlayer"), url, true);
}

function load(type) {

  resetAllDivText();
  const idAsset = type == 'hls' ? 1 : 2;
  const urlToGet = `${location.protocol}\/\/${location.hostname}/tokengenerate?id=` + idAsset;

  const user = $("#inputUsername").val();
  const pass = $("#inputPassword").val();

  $.ajax({
    type: 'POST',
    url: urlToGet,
    headers: {
      "Authorization": "Basic " + btoa(user + ":" + pass)
    },
    success: function (data, status, xhr) {
      showResultDiv();
      showVideo();
      hideLoginDiv()
      hideErrorDiv();

      var manifest_url = data;
      var l = getLocation(manifest_url);
      var tokens = l.pathname.substring(1, l.pathname.indexOf('/', 1)).split(".");
      const jwtHeader = library.json.prettyPrint(JSON.parse(atob(tokens[1])));
      const jwtPayload = library.json.prettyPrint(JSON.parse(atob(tokens[2])));

      showVideoMetadata(urlToGet, data, jwtHeader, jwtPayload);

      if (type == 'hls') {
        playHLS(manifest_url);
      } else {
        playDASH(manifest_url);
      }

    },
    error: function (data, status, xhr) {

      if (data.status == 401) {
        //error authentication
        showLoginErrorDiv();
        showLoginError("Authentication failed!");
        enableSubmitButton();

      } else if (data.status == 404) {
        //not found
        showVideoError("Video asset not configured for " + type.toUpperCase()+ " !")
        showVideoErrorDiv();
        hideLoginDiv();
        showResultDiv();
        hideVideo();

      } else {
        //different error
        $("#errorAsset").text("Unknown error!");

        showVideoErrorDiv();
        hideLoginDiv();
        showResultDiv();

      }
      destroyPlayers();
      resetAllDivText();

    }
  });


}

function showVideoMetadata(requestUrl, playbackUrl, jwtHeader, jwtPayload) {
  $("#request_url_value").text(requestUrl);
  $("#playback_url_value").text(playbackUrl);
  $('#jwt_header').html(jwtHeader);
  $('#jwt_payload').html(jwtPayload);
}
function showLoginError(errorMsg) {
  $("#errorMsg").text(errorMsg);
}
function showVideoError(errorMsg) {
  $("#errorAsset").text(errorMsg);
}
function showResultDiv() {
  $("#result").removeClass('d-none');
  $("#video_div").removeClass('d-none');
  $("#metadataDiv").removeClass('d-none');
}

function hideVideo(){
  $("#video_div").addClass('d-none');
  $("#metadataDiv").addClass('d-none');
}
function showVideo(){
  $("#video_div").removeClass('d-none');
  $("#metadataDiv").removeClass('d-none');
}

function hideLoginDiv() {
  $("#login").addClass('d-none');
}

function showVideoErrorDiv() {
  $("#errorAsset").removeClass('d-none');
}
function showLoginErrorDiv() {
  $("#errorMsg").removeClass('d-none');
}
function hideErrorDiv() {
  $("#errorMsg").addClass('d-none');
  $("#errorAsset").addClass('d-none');
}
function enableSubmitButton() {
  $('#submit').prop('disabled', false);
  $("#submit").text("Sign in");
}

function resetAllDivText() {
  $("#request_url_value").text('');
  $("#playback_url_value").text('');
  $('#jwt_header').text('');
  $('#jwt_payload').html('');
}
function destroyPlayers() {
  hls.detachMedia();
  if (dash_initialized) {
    playerDash.reset();
  }

}

function enableRevokeSessionButton() {
  $('#sessionrevoke').prop('disabled', false);
  $("#sessionrevoke").text("Revoke current session");
}

function loadingRevokeSessionButton() {
  $('#sessionrevoke').prop('disabled', true);
  $("#sessionrevoke").text("Submitting...");
}

$('#hls').on('change', function () {
  load('hls');

});

$('#dash').on('change', function () {
  load('dash')

});

$('#sessionrevoke').on('click', function () {

  console.log("Session revoke");
  loadingRevokeSessionButton();

  const playback_url = $("#playback_url_value").text();
  console.log(playback_url);
  var l = getLocation(playback_url);
  const session_id=l.pathname.split(".")[0];
  console.log("session_id="+session_id);
  const urlToGet = `${location.protocol}\/\/${location.hostname}/sessionrevoke?sessionid=` + session_id;

  $.ajax({
    type: 'POST',
    url: urlToGet,
    success: function (data, status, xhr) {
      console.log("Session revocation OK");
      enableRevokeSessionButton();
    },
    error: function (data, status, xhr) {
      console.log("Session revocation error:" + JSON.stringify(data));
      if(data.status==0){
        showVideoError("Session revocation feature not deployed!");
      }
      enableRevokeSessionButton();

    }
  });

});



