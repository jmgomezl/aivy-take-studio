// Development-only fixture. Excluded from static releases. No hardware capture.
navigator.mediaDevices.enumerateDevices=async()=>[
 {kind:'audioinput',deviceId:'qa-mic',label:'QA synthetic microphone',groupId:'qa'},
 {kind:'videoinput',deviceId:'qa-camera',label:'QA synthetic camera',groupId:'qa'},
];
navigator.mediaDevices.getUserMedia=async constraints=>{
 const tracks=[];
 if(constraints.audio){
  const context=new AudioContext();await context.resume();
  const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
  oscillator.frequency.value=220;gain.gain.value=.08;oscillator.connect(gain).connect(destination);oscillator.start();
  tracks.push(...destination.stream.getAudioTracks());
 }
 if(constraints.video){
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');
  const draw=()=>{ctx.fillStyle='#203d36';ctx.fillRect(0,0,640,480);ctx.fillStyle='#efbd9d';ctx.beginPath();ctx.arc(320,180,80,0,Math.PI*2);ctx.fill();ctx.fillRect(230,280,180,200);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('SYNTHETIC QA CAMERA',175,35);requestAnimationFrame(draw);};draw();
  tracks.push(...canvas.captureStream(15).getVideoTracks());
 }
 return new MediaStream(tracks);
};
