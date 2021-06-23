/* eslint-env browser */

/* global Webex */

/* eslint-disable camelcase */
/* eslint-disable max-nested-callbacks */
/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable require-jsdoc */
/* eslint-disable arrow-body-style */
/* eslint-disable max-len */

// Declare some globals that we'll need throughout
let activeMeeting, remoteShareStream, webex;

let token;

let toggleSourcesSendAudioStatus;
let toggleSourcesSendVideoStatus;

let globalLocalShare;
let globalLocalStream;

let value;



$(document).ready(function(){
  // First, let's wire our form fields up to localStorage so we don't have to
// retype things everytime we reload the page.
  /*[
    'access-token',
    'invitee'
  ].forEach((id) => {
    const el = document.getElementById(id);
    console.log("HENLO")

    try {
      el.value = localStorage.getItem(id);
      el.addEventListener('change', (event) => {
        localStorage.setItem(id, event.target.value);
      });
    }
    catch {
      console.log("EMPTY LOCAL STORAGE")
    }
  });*/

  // In order to simplify the state management needed to keep track of our button
// handlers, we'll rely on the current meeting global object and only hook up event
// handlers once.
  token = $('#token').val();
  console.log(token)
  let meetingNumber = $('#meeting').val();

  const destination = meetingNumber + '@webex.com'
  console.log(destination)

  // we'll use `connect()` (even though we might already be connected or
  // connecting) to make sure we've got a functional webex instance.
  connect()

  connect()
      .then(() => {
        // Create the meeting
        return webex.meetings.create(destination).then((meeting) => {
          // Pass the meeting to our join meeting helper
          return joinMeeting(meeting);
        });
      })
      .catch((error) => {
        // Report the error
        console.error(error);

        // Implement error handling here
      });

  document.getElementById('share-screen').addEventListener('click', () => {
    if (activeMeeting) {
      // First check if we can update
      waitForMediaReady(activeMeeting).then(() => {
        console.info('SHARE-SCREEN: Sharing screen via `shareScreen()`');
        activeMeeting.shareScreen()
            .then(() => {
              console.info('SHARE-SCREEN: Screen successfully added to meeting.');
            })
            .catch((e) => {
              console.error('SHARE-SCREEN: Unable to share screen, error:');
              console.error(e);
            });
      });
    }
    else {
      console.error('No active meeting available to share screen.');
    }
  });

  document.getElementById('stop-screen-share').addEventListener('click', () => {
    if (activeMeeting) {
      // First check if we can update, if not, wait and retry
      waitForMediaReady(activeMeeting).then(() => {
        activeMeeting.stopShare();
      });
    }
  });

  toggleSourcesSendAudioStatus = document.querySelector('#ts-toggle-audio-status');
  toggleSourcesSendVideoStatus = document.querySelector('#ts-toggle-video-status');

// Now, let's set up connection handling
//   document.getElementById('credentials').addEventListener('submit', (event) => {
//     // let's make sure we don't reload the page when we submit the form
//     event.preventDefault();
//     console.log("HELP")
//
//     // The rest of the connection setup happens in connect();
//     connect();
//   });

// And finally, let's wire up dialing
//   document.getElementById('dialer').addEventListener('submit', (event) => {
//     // again, we don't want to reload when we try to dial
//     event.preventDefault();
//
//     const destination = document.getElementById('invitee').value;
//
//     // we'll use `connect()` (even though we might already be connected or
//     // connecting) to make sure we've got a functional webex instance.
//     connect()
//         .then(() => {
//           // Create the meeting
//           return webex.meetings.create(destination).then((meeting) => {
//             // Pass the meeting to our join meeting helper
//             return joinMeeting(meeting);
//           });
//         })
//         .catch((error) => {
//           // Report the error
//           console.error(error);
//
//           // Implement error handling here
//         });
//   });

});



// There's a few different events that'll let us know we should initialize
// Webex and start listening for incoming calls, so we'll wrap a few things
// up in a function.
function connect() {
  return new Promise((resolve) => {
    if (!webex) {
      // eslint-disable-next-line no-multi-assign
      webex = window.webex = Webex.init({
        config: {
          logger: {
            level: 'debug'
          },
          meetings: {
            reconnection: {
              enabled: true
            }
          }
          // Any other sdk config we need
        },

        credentials: {
          access_token: token
        }
      });
    }

    // Listen for added meetings
    webex.meetings.on('meeting:added', (addedMeetingEvent) => {
      if (addedMeetingEvent.type === 'INCOMING') {
        const addedMeeting = addedMeetingEvent.meeting;

        // Acknowledge to the server that we received the call on our device
        addedMeeting.acknowledge(addedMeetingEvent.type)
            .then(() => {
              if (confirm('Answer incoming call')) {
                joinMeeting(addedMeeting);
              }
              else {
                addedMeeting.decline();
              }
            });
      }
    });

    // Register our device with Webex cloud
    if (!webex.meetings.registered) {
      webex.meetings.register()
          // Sync our meetings with existing meetings on the server
          .then(() => webex.meetings.syncMeetings())
          .then(() => {
            // This is just a little helper for our selenium tests and doesn't
            // really matter for the example
            document.body.classList.add('listening');
            document.getElementById('connection-status').innerHTML = 'Connected!';
            // Our device is now connected
            resolve();
          })
          // This is a terrible way to handle errors, but anything more specific is
          // going to depend a lot on your app
          .catch((err) => {
            console.error(err);
            // we'll rethrow here since we didn't really *handle* the error, we just
            // reported it
            throw err;
          });
    }
    else {
      // Device was already connected
      resolve();
    }
  });
}

// Similarly, there are a few different ways we'll get a meeting Object, so let's
// put meeting handling inside its own function.
function bindMeetingEvents(meeting) {
  // meeting is a meeting instance, not a promise, so to know if things break,
  // we'll need to listen for the error event. Again, this is a rather naive
  // handler.
  meeting.on('error', (err) => {
    console.error(err);
  });

  meeting.on('meeting:startedSharingRemote', () => {
    // Set the source of the video element to the previously stored stream
    document.getElementById('remote-screen').srcObject = remoteShareStream;
    document.getElementById('screenshare-tracks-remote').innerHTML = 'SHARING';
  });

  meeting.on('meeting:stoppedSharingRemote', () => {
    document.getElementById('remote-screen').srcObject = null;
    document.getElementById('screenshare-tracks-remote').innerHTML = 'STOPPED';
  });

  // Handle media streams changes to ready state
  meeting.on('media:ready', (media) => {
    if (!media) {
      return;
    }
    console.log(`MEDIA:READY type:${media.type}`);
    if (media.type === 'local') {
      document.getElementById('self-view').srcObject = media.stream;
    }
    if (media.type === 'remoteVideo') {
      document.getElementById('remote-view-video').srcObject = media.stream;
    }
    if (media.type === 'remoteAudio') {
      document.getElementById('remote-view-audio').srcObject = media.stream;
    }
    if (media.type === 'remoteShare') {
      // Remote share streams become active immediately on join, even if nothing is being shared
      remoteShareStream = media.stream;
    }
    if (media.type === 'localShare') {
      document.getElementById('self-screen').srcObject = media.stream;
    }
  });

  // Handle media streams stopping
  meeting.on('media:stopped', (media) => {
    // Remove media streams
    if (media.type === 'local') {
      document.getElementById('self-view').srcObject = null;
    }
    if (media.type === 'remoteVideo') {
      document.getElementById('remote-view-video').srcObject = null;
    }
    if (media.type === 'remoteAudio') {
      document.getElementById('remote-view-audio').srcObject = null;
    }
    if (media.type === 'localShare') {
      document.getElementById('self-screen').srcObject = null;
    }
  });

  // Handle share specific events
  meeting.on('meeting:startedSharingLocal', () => {
    document.getElementById('screenshare-tracks').innerHTML = 'SHARING';
  });
  meeting.on('meeting:stoppedSharingLocal', () => {
    document.getElementById('screenshare-tracks').innerHTML = 'STOPPED';
  });

  // Update participant info
  meeting.members.on('members:update', (delta) => {
    const {full: membersData} = delta;
    const memberIDs = Object.keys(membersData);

    memberIDs.forEach((memberID) => {
      const memberObject = membersData[memberID];

      // Devices are listed in the memberships object.
      // We are not concerned with them in this demo
      if (memberObject.isUser) {
        if (memberObject.isSelf) {
          document.getElementById('call-status-local').innerHTML = memberObject.status;
        }
        else {
          document.getElementById('call-status-remote').innerHTML = memberObject.status;
        }
      }
    });
  });

  // Of course, we'd also like to be able to end the meeting:
  const leaveMeeting = () => meeting.leave();

  document.getElementById('hangup').addEventListener('click', leaveMeeting, {once: true});

  meeting.on('all', (event) => {
    console.log(event);
  });
}


// Waits for the meeting to be media update ready
function waitForMediaReady(meeting) {
  return new Promise((resolve, reject) => {
    if (meeting.canUpdateMedia()) {
      resolve();
    }
    else {
      console.info('SHARE-SCREEN: Unable to update media, pausing to retry...');
      let retryAttempts = 0;

      const retryInterval = setInterval(() => {
        retryAttempts += 1;
        console.info('SHARE-SCREEN: Retry update media check');

        if (meeting.canUpdateMedia()) {
          console.info('SHARE-SCREEN: Able to update media, continuing');
          clearInterval(retryInterval);
          resolve();
        }
        // If we can't update our media after 15 seconds, something went wrong
        else if (retryAttempts > 15) {
          console.error('SHARE-SCREEN: Unable to share screen, media was not able to update.');
          clearInterval(retryInterval);
          reject();
        }
      }, 1000);
    }
  });
}

// Join the meeting and add media
// function joinMeeting(meeting) {
//   // Save meeting to global object
//   activeMeeting = meeting;
//
//   // Call our helper function for binding events to meetings
//   bindMeetingEvents(meeting);
//
//   const mediaSettings = {
//     receiveVideo: true,
//     receiveAudio: true,
//     receiveShare: true,
//     sendVideo: true,
//     sendAudio: true,
//     sendShare: false
//   };
//
//   return meeting.getMediaStreams(mediaSettings).then((mediaStreams) => {
//     [localStream, localShare] = mediaStreams
//   }).then(() => {
//     return meeting.join().then(() => {
//       // meeting.addMedia({
//       //   globalLocalShare,
//       //   globalLocalStream,
//       //   mediaSettings
//       // });
//       console.log(meeting.members);
//       return new Promise((resolve, reject) => {
//         let membersList = meeting.members.membersCollection.members;
//         let memberIDs = Object.keys(membersList);
//         memberIDs.forEach((memberID) => {
//           const memberObject = membersList[memberID];
//
//           // Devices are listed in the memberships object.
//           // We are not concerned with them in this demo
//           if (memberObject.isUser) {
//             if (memberObject.isSelf) {
//               console.log(memberObject);
//               if (memberObject.isInMeeting) {
//                 value = true;
//               }
//               else {
//                 value = false;
//               }
//             }
//           }
//         });
//         // let person;
//         // for (person in membersList) {
//         //   if (person.isSelf) {
//         //     if (person.isInMeeting) {
//         //       value = true;
//         //     }
//         //   }
//         // }
//
//         if (value) {
//           resolve();
//         } else {
//           console.info('ADMIT: Waiting');
//           let retryAttempts = 0;
//           const retryInterval = setInterval(() => {
//             retryAttempts += 1;
//             console.info('ADMIT: Retry admit check');
//             membersList = meeting.members.membersCollection.members;
//             memberIDs = Object.keys(membersList);
//
//             memberIDs.forEach((memberID) => {
//               const memberObject = membersList[memberID];
//
//               // Devices are listed in the memberships object.
//               // We are not concerned with them in this demo
//               if (memberObject.isUser) {
//                 if (memberObject.isSelf) {
//                   console.log(memberObject);
//                   if (memberObject.isInMeeting) {
//                     value = true;
//                   }
//                   else {
//                     value = false;
//                   }
//                 }
//               }
//             });
//
//             if (value) {
//               console.info('ADMIT: Adding Media');
//               clearInterval(retryInterval);
//               meeting.addMedia({
//                 localShare,
//                 localStream,
//                 mediaSettings
//               });
//               resolve();
//             }
//             // If we can't update our media after 15 seconds, something went wrong
//             else if (retryAttempts > 60) {
//               console.error('ADMIT: Not admitted in time');
//               clearInterval(retryInterval);
//               reject();
//             }
//           }, 1000);
//         }
//       });
//     });
//   });
// }

// OLD

// Join the meeting and add media
function joinMeeting(meeting) {
  // Save meeting to global object
  activeMeeting = meeting;

  // Call our helper function for binding events to meetings
  bindMeetingEvents(meeting);

  return meeting.join().then(() => {
    const mediaSettings = {
      receiveVideo: true,
      receiveAudio: true,
      receiveShare: true,
      sendVideo: true,
      sendAudio: true,
      sendShare: false
    };

    return meeting.getMediaStreams(mediaSettings).then((mediaStreams) => {
      const [localStream, localShare] = mediaStreams;

      meeting.addMedia({
        localShare,
        localStream,
        mediaSettings
      });
    });
  });
}

function getCurrentMeeting() {
  const meetings = webex.meetings.getAllMeetings();

  return meetings[Object.keys(meetings)[0]];
}

function toggleSendAudio() {
  const meeting = getCurrentMeeting();

  const handleError = (error) => {
    toggleSourcesSendAudioStatus.innerText = 'Error! See console for details.';
    console.log('MeetingControls#toggleSendAudio() :: Error toggling audio!');
    console.error(error);
  };

  console.log('MeetingControls#toggleSendAudio()');
  if (!meeting) {
    console.log('MeetingControls#toggleSendAudio() :: no valid meeting object!');

    return;
  }

  if (meeting.isAudioMuted()) {
    meeting.unmuteAudio()
        .then(() => {
          toggleSourcesSendAudioStatus.innerText = 'Toggled audio on!';
          console.log('MeetingControls#toggleSendAudio() :: Successfully unmuted audio!');
        })
        .catch(handleError);
  }
  else {
    meeting.muteAudio()
        .then(() => {
          toggleSourcesSendAudioStatus.innerText = 'Toggled audio off!';
          console.log('MeetingControls#toggleSendAudio() :: Successfully muted audio!');
        })
        .catch(handleError);
  }
}


function toggleSendVideo() {
  const meeting = getCurrentMeeting();

  const handleError = (error) => {
    toggleSourcesSendVideoStatus.innerText = 'Error! See console for details.';
    console.log('MeetingControls#toggleSendVideo() :: Error toggling video!');
    console.error(error);
  };

  console.log('MeetingControls#toggleSendVideo()');
  if (!meeting) {
    console.log('MeetingControls#toggleSendVideo() :: no valid meeting object!');

    return;
  }

  if (meeting.isVideoMuted()) {
    meeting.unmuteVideo()
        .then(() => {
          toggleSourcesSendVideoStatus.innerText = 'Toggled video on!';
          console.log('MeetingControls#toggleSendVideo() :: Successfully unmuted video!');
        })
        .catch(handleError);
  }
  else {
    meeting.muteVideo()
        .then(() => {
          toggleSourcesSendVideoStatus.innerText = 'Toggled video off!';
          console.log('MeetingControls#toggleSendVideo() :: Successfully muted video!');
        })
        .catch(handleError);
  }
}


