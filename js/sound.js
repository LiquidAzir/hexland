/* ============================================================
   sound.js — Web Audio synth (no asset files)
   ============================================================ */
window.HL = window.HL || {};

(function(HL) {
  'use strict';

  var ctx = null;
  var muted = false;
  var STORAGE_KEY = 'hexland_sound_v1';

  // Read persisted mute state
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '0') muted = true;
  } catch (e) {}

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(STORAGE_KEY, muted ? '0' : '1'); } catch (e) {}
  }
  function isMuted() { return muted; }

  // Schedule a simple oscillator note
  function note(freq, dur, type, gainLevel, attack, release) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    var t0 = c.currentTime;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    var maxGain = gainLevel == null ? 0.18 : gainLevel;
    var att = attack == null ? 0.01 : attack;
    var rel = release == null ? Math.max(0.04, dur * 0.4) : release;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(maxGain, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + rel + 0.05);
  }

  // Short noise burst (for dice, robber)
  function noise(dur, lowpassHz, gainLevel) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    var t0 = c.currentTime;
    var bufSize = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, bufSize, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    var src = c.createBufferSource();
    src.buffer = buf;
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpassHz || 1200;
    var g = c.createGain();
    g.gain.value = gainLevel == null ? 0.22 : gainLevel;
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t0);
  }

  function play(name) {
    if (muted) return;
    switch (name) {
      case 'click':
        note(660, 0.04, 'square', 0.06, 0.005, 0.03);
        break;
      case 'roll':
        // Dice clatter — two short noise bursts
        noise(0.12, 2400, 0.18);
        setTimeout(function(){ noise(0.10, 2000, 0.14); }, 90);
        break;
      case 'build-road':
        note(330, 0.08, 'triangle', 0.14);
        setTimeout(function(){ note(440, 0.08, 'triangle', 0.12); }, 60);
        break;
      case 'build-settle':
        note(523, 0.10, 'triangle', 0.16);
        setTimeout(function(){ note(659, 0.10, 'triangle', 0.14); }, 70);
        setTimeout(function(){ note(784, 0.14, 'triangle', 0.13); }, 140);
        break;
      case 'build-city':
        note(440, 0.10, 'sawtooth', 0.10);
        setTimeout(function(){ note(660, 0.10, 'sawtooth', 0.10); }, 70);
        setTimeout(function(){ note(880, 0.20, 'triangle', 0.14); }, 140);
        break;
      case 'buy-dev':
        note(880, 0.06, 'sine', 0.10);
        setTimeout(function(){ note(1320, 0.06, 'sine', 0.10); }, 50);
        setTimeout(function(){ note(1760, 0.12, 'sine', 0.12); }, 100);
        break;
      case 'robber':
        noise(0.30, 220, 0.30);
        setTimeout(function(){ note(110, 0.18, 'sawtooth', 0.18); }, 40);
        break;
      case 'production':
        note(880, 0.06, 'sine', 0.08);
        setTimeout(function(){ note(1175, 0.10, 'sine', 0.08); }, 50);
        break;
      case 'trade':
        note(740, 0.06, 'triangle', 0.10);
        setTimeout(function(){ note(988, 0.08, 'triangle', 0.10); }, 60);
        break;
      case 'win':
        var notes = [523, 659, 784, 1047];
        notes.forEach(function(f, i) {
          setTimeout(function(){ note(f, 0.18, 'triangle', 0.16); }, i * 110);
        });
        break;
      case 'lose':
        note(330, 0.20, 'sawtooth', 0.12);
        setTimeout(function(){ note(247, 0.30, 'sawtooth', 0.12); }, 180);
        break;
      case 'bad':
        note(220, 0.10, 'sawtooth', 0.10);
        break;
    }
  }

  HL.Sound = {
    play: play,
    setMuted: setMuted,
    isMuted: isMuted,
    resume: function() { var c = ensureCtx(); if (c && c.state === 'suspended') { try { c.resume(); } catch(e){} } }
  };

})(window.HL);
