// function details() {
const details = () => ({
  // return {
    id: 'Codefaux-MKVFixes',
    Stage: 'Pre-processing',
    Name: 'Codefaux-MKVFixes',
    Type: 'Any',
    Operation:'Transcode',
    Description: 'Change container to MKV and fix video/data/subtitle track related issues ie webvtt, dvd_nav_packet, embeds, etm',
    Version: '0.2.8a',
    Tags:'pre-processing,ffmpeg,transcode,configurable',
    Inputs: [
      {
        name: 'mov_text',
        tooltip: 'mov_text: Convert mp4 subtitles to SRT or Drop \\n - Convert (Recommended) provides functionally identical output. \\n - Drop removes the subtitle stream. \\n -- I will not add a burn-in option, this is not a video transcode plugin.)',
        type: 'string',
        defaultValue: 'convert',
        inputUI: {
          type: 'dropdown',
          options: [
            'convert',
            'drop',
          ],
        },
      },
      {
        name: 'webvtt',
        tooltip: 'webvtt: Decode as SRT or Drop \\n -- tdarr (all versions, last checked 2.27.02) packaged ffmpeg errors handling webvtt \\n ' + 
                 ' - Force (!NOT RECOMMENDED!) forces ffmpeg to detect and handle webvtt stream as webvtt on decode, resulting output will bear a webvtt track. \\n ' +
                 ' FORCE SILENTLY PRODUCES BROKEN FILES. IT IS PROVIDED ONLY FOR TESTING. OUTPUT FILE WILL BE UNDERSIZE AND SKIP EVERY FEW SECONDS. DO NOT USE. YOU HAVE BEEN WARNED. \\n ' +
                 ' - Convert (Recommended) overrides ffmpeg decode codec as SRT. Behind the scenes webvtt and srt are very similar. This option functions, but you will lose webvtt features like styling, placement, etc \\n ' + 
                 ' - Drop removes the subtitle stream. Only recommended if extracting vtt as part of own processing or if SRT is problematic.',
        type: 'string',
        defaultValue: 'convert',
        inputUI: {
          type: 'dropdown',
          options: [
            'convert',
            'drop',
            'force',
          ],
        },
      },
      {
        name: 'eia608',
        tooltip: 'eia608: Preserve or Drop \\n -- ffprobe / mediainfo seem to miss these streams already so this may never trigger \\n -- Some players have (had?) issues with EIA608 subtitles, due to CPU decode demand \\n -- Transcode is not possible as eia608 requires OCR. ',
        type: 'string',
        defaultValue: 'preserve',
        inputUI: {
          type: 'dropdown',
          options: [
            'preserve',
            'drop',
          ],
        },
      },
      {
        name: 'dvd_nav_packet',
        tooltip: 'dvd_nav_packet: Preserve or Drop \\n -- dvd_nav_packet provides PCI and DSI packets from VOB streams, and are not supported or necessary in MKV containers. \\n ' + 
                 ' - Preserve is present only for testing and will probably always cause an error. \\n ' +
                 ' - Drop is recommended, and default.',
        type: 'string',
        defaultValue: 'drop',
        inputUI: {
          type: 'dropdown',
          options: [
            'preserve',
            'drop',
          ],
        },
      },
      {
        name: 'bad_image_tracks',
        tooltip: 'bad image tracks: Preserve or Drop \\n -- bmp, mjpeg, gif tracks embedded as video tracks \\n -- only png, jpg are supported by mkv and must also be properly embedded and sized \\n ' + 
                 ' - Preserve is present only for testing and will probably always cause an error. \\n ' +
                 ' - Drop is recommended, and default.',
        type: 'string',
        defaultValue: 'drop',
        inputUI: {
          type: 'dropdown',
          options: [
            'preserve',
            'drop',
          ],
        },
      },
      {
        name: 'good_image_tracks',
        tooltip: 'good image tracks: Preserve or Drop \\n -- png, jpeg tracks embedded as video tracks \\n -- must be named properly, must be correct size, proper detection not implemented (need good AND bad test files) \\n ' + 
                 ' - Preserve is present mostly for testing and will cause an error if improperly formatted images are present. Provide samples to Codefaux for detection. \\n ' +
                 ' - Drop is recommended, but not default to avoid unexpected changes to files',
        type: 'string',
        defaultValue: 'preserve',
        inputUI: {
          type: 'dropdown',
          options: [
            'preserve',
            'drop',
          ],
        },
      },
    ],
  // };
});

// function plugin (file, librarypreferences, inputs) {
const plugin = (file, inputs) => {
  var transcode = 0;
  var dataid = 0;
  var subid = 0;
  var vid=0;
  var subcli = '';
  var dropcli = '';
  var prependcli = '';

//default values that will be returned
  var response = {
    processFile: false,
    preset: ' ',
    container: '.mkv',
    handBrakeMode: false,
    FFmpegMode: false,
    infoLog: '',
  };

  const lib = require('../methods/lib')();
  inputs = lib.loadDefaultValues(inputs, details);

  response.infoLog += ' == v' + details().Version + '\n  Scanning.... \n ';

// Scan streams. -explicitly correct webvtt subtitle codec -convert mov_text to srt  -drop eia_608  -drop image attachments
  for (var i = 0; i < file.ffProbeData.streams.length; i++) {
    response.infoLog += ` Stream ${i} type ${file.ffProbeData.streams[i].codec_type.toLowerCase()}  \n `;
    response.infoLog += ` - codec_name ${file.ffProbeData.streams[i].codec_name} \n `;
    if ( file.ffProbeData.streams.length + 1 == file.mediaInfo.track.length )
    { response.infoLog += ` - CodecID ${file.mediaInfo.track[i+1].CodecID} \n `; }
    else
    { response.infoLog += ` - CodecID matching unavailable, sometimes ffprobedata and mediainfo count streams differently and this is not handled presently. \n `; }
  
    switch ( file.ffProbeData.streams[i].codec_type.toLowerCase() ) {
      case 'data':
        if ( file.ffProbeData.streams[i].codec_name.toLowerCase() == "dvd_nav_packet" ) {
          response.infoLog += '  - data stream #' + dataid + ': dvd_nav_packet: configured ' + inputs.dvd_nav_packet + ' \n ';
          switch ( inputs.dvd_nav_packet ) {
            default:
            case 'drop':
              transcode = 1;
              dropcli += ' -map -d:' + dataid + ' ';
              break;
            case 'preserve':
              // Nothing to do.
              break;
          }
          dataid++;
        }
        break; 
      case 'subtitle':
        if (( typeof file.ffProbeData.streams[i].codec_name == 'undefined' ) & ( file.container.toLowerCase() == "mkv" )) {
          response.infoLog += ' - quirk: ffmpeg fails webvtt detection \n ';
          if ( file.mediaInfo.track[i+1].CodecID=="S_TEXT/WEBVTT") {
            response.infoLog += '  - subtitle stream #' + subid + ': webvtt: configured ' + inputs.webvtt + ' \n ';
            switch ( inputs.webvtt ) {
              default:
              case 'convert':
                transcode = 1;
                prependcli += ' -c:s:' + subid + ' srt ';
                break;
              case 'drop':
                transcode = 1;
                dropcli += ' -map -s:' + subid + ' ';
                break;
              case 'force': // -- should be correct action, FAIL, chop/skip/small file
                response.infoLog += '- forcing problematic subtitle codec -- OUTPUT WILL BE BROKEN \n ';
                transcode = 1;
                prependcli += ' -c:s:' + subid + ' webvtt ';
                break;
            }
          }
        } else {
          switch ( file.ffProbeData.streams[i].codec_name.toLowerCase() ) {
            case 'mov_text':
              response.infoLog += '  - subtitle stream #' + subid + ': mov_text: configured ' + inputs.mov_text + ' \n ';
              switch ( inputs.mov_text )
              {
                default:
                case 'convert':
                  transcode = 1;
                  subcli += ' -c:s:' + subid + ' srt ';
                  break;
                case 'drop':
                  transcode = 1;
                  dropcli += ' -map -s:' + subid + ' ';
                  break;
              }
              break;
            case 'eia_608':
              response.infoLog += '  - subtitle stream #' + subid + ': eia608: configured ' + inputs.eia608 + ' \n ';
              switch ( inputs.eia608 )
              {
                case 'preserve':
                  // Nothing to do
                  break;
                default:
                case 'drop':
                  transcode = 1;
                  dropcli += ' -map -s:' + subid + ' ';
                  break;
              }
              break;
            default:
              break;
          }
        }
        subid++;
        break;
      case 'video':
        switch ( file.ffProbeData.streams[i].codec_name.toLowerCase() ) {
          case 'png':
          case 'jpg':
            response.infoLog += '  - video stream #' + vid + ': good_image_tracks: configured ' + inputs.good_image_tracks + ' \n ';
            switch ( inputs.good_image_tracks )
            {
              default:
              case 'drop':
                transcode = 1;
                dropcli += ' -map -v:' + vid + ' ';
                break;
              case 'preserve':
                // Nothing to do
                break; 
            }
            break;
          case 'mjpeg':
          case 'bmp':
          case 'gif':
            response.infoLog += '  - video stream #' + vid + ': bad_image_tracks: configured ' + inputs.bad_image_tracks + ' \n ';
            switch ( inputs.bad_image_tracks )
            {
              default:
              case 'drop':
                transcode = 1;
                dropcli += ' -map -v:' + vid + ' ';
                break;
              case 'preserve':
                // Nothing to do
                break; 
            }
            break;
          default:
            break;
        }
        vid++;
        break;
      case 'audio':
        // Not processing audio presently
        break;
      default:
        response.infoLog += `-- Unsupported track format ${file.ffProbeData.streams[i].codec_type?.toLowerCase() ?? ""}, please report. \n`;
        break;
    }
  }

//check if the file is eligible for transcoding
//if true the neccessary response values will be changed
  response.infoLog += 'Transcode check... \n ';

  if (transcode == 1) {
    response.preset = prependcli + ` , -map 0:v? -map 0:a? -map 0:s? -map 0:d? -map 0:t? -map_metadata 0 `; // Implicitly map streams
    response.preset += ` ${dropcli} `; // Drop streams we don't like / don't support
    response.preset += ` -scodec copy -dcodec copy -acodec copy -vcodec copy `; // codec copy as default
    response.preset += ` -a53cc 0 ${subcli} `; // Subtitle fixes

    response.processFile = true;
    response.FFmpegMode = true;

    response.infoLog += '- Fixes required. File will be processed here. \n ';
  } else {
    response.infoLog += '- No fixes required. File will not be processed here. \n ';
  }

  return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
