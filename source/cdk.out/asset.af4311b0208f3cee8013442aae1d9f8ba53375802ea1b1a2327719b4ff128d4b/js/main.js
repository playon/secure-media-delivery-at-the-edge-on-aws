const exports = {
  manifest_store: 'tokengenerate',
  stream_id: '1'
}

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


function loadHLS(user, pass) {

  var urlToGet = `${location.protocol}\/\/${location.hostname}/${manifest_store}?id=${stream_id}`
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
      $("#errorMsg").addClass('d-none');

      $("#request_url_value").text(urlToGet);
      $("#playback_url_value").text(data);

      var manifest_url = data;
      var l = getLocation(manifest_url);
      var tokens = l.pathname.substring(1, l.pathname.indexOf('/', 1)).split(".");

      $('#jwt_header').html(library.json.prettyPrint(JSON.parse(atob(tokens[1]))));
      $('#jwt_payload').html(library.json.prettyPrint(JSON.parse(atob(tokens[2]))));

      if (Hls.isSupported()) {

        var video = document.getElementById('videoPlayer');
        var hls = new Hls();
        // bind them together
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
          console.log('video and hls.js are now bound together !');
          hls.loadSource(manifest_url);
          hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
            console.log(
              'manifest loaded, found ' + data.levels.length + ' quality level'
            );
          });

          video.play();
        });
      }


    },
    error: function (data, status, xhr) {
      $("#errorMsg").removeClass('d-none');
      $("#login").removeClass('d-none');

      $('#submit').prop('disabled', false);
      $("#submit").text("Sign in");

      player.reset();
      $("#url_value").text('');

    }
  });



}


