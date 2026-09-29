/**
 * TDict — Inline Selection Translator & Academic Dictionary Web Component
 * @version 1.0.0
 * @author pyhyper (https://github.com/pyhyper/TDict)
 * @license MIT with Attribution
 */
(function (global) {
  'use strict';
  class SelectionTranslator {
    constructor(options = {}) {
      this.root = typeof options.root === 'string' ? document.querySelector(options.root) : options.root || document.body;
      if (!this.root) throw new Error('Không tìm thấy vùng nội dung cần dịch.');
      this.source = options.source || 'en';
      this.target = options.target || 'vi';
      this.maxBytes = options.maxBytes ?? 500;
      let defaultDictUrl = './api/lookup.php';
      if (typeof document !== 'undefined') {
        const currentScript = document.currentScript || (typeof document.querySelectorAll === 'function' ? Array.from(document.querySelectorAll('script')).find(s => s.src && s.src.includes('selection-translator.js')) : null);
        if (currentScript && currentScript.src) {
          try {
            defaultDictUrl = new URL('api/lookup.php', currentScript.src).href;
          } catch {}
        }
      }
      this.dictionaryUrl = options.dictionaryUrl === false ? null : (options.dictionaryUrl || defaultDictUrl);
      this.translate = options.translate || this.defaultTranslate.bind(this);
      this.lookup = options.lookup || this.defaultLookup.bind(this);
      this.lookupTimeout = options.lookupTimeout ?? 2500;
      this.translationLabel = options.translate ? 'API dịch tùy chỉnh' : 'MyMemory';
      this.playbackId = 0;
      this.voicePreferences = new Map();
      this.speechLang = options.speechLang || (this.source === "en" ? "en-US" : this.source);
      this.cache = new Map();
      this.version = 0;
      this.listeners = [];
      this.host = document.createElement('div');
      this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;';
      const shadow = this.host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>
        :host { color-scheme:light; }
        * { box-sizing:border-box; }
        .card { width:min(400px,calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; background:#fff; color:#172b35; border:1px solid #dce5e6; border-radius:16px; padding:18px; box-shadow:0 12px 42px #143f4930; font:14px/1.6 system-ui,sans-serif; }
        header { display:flex; align-items:center; justify-content:space-between; gap:12px; color:#00776e; font-weight:700; }
        button { border:0; background:#edf5f4; color:#234; border-radius:8px; padding:4px 10px; cursor:pointer; font:inherit; }
        button:focus-visible { outline:2px solid #00776e; }
        .audio-controls { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; font-size:12px; }
        .voice-select { width:100%; margin-top:8px; padding:6px; border:1px solid #dce5e6; border-radius:6px; background:white; color:#234; font:12px system-ui; }
        .audio-status { font-size:11px; color:#63747d; margin-top:5px; }
        .original { color:#63747d; margin:10px 0 8px; overflow-wrap:anywhere; max-height:90px; overflow:auto; }
        .result { font-size:17px; overflow-wrap:anywhere; white-space:pre-wrap; }
        .meta { color:#00776e; font-size:13px; margin:8px 0; }
        .sense { border-top:1px solid #e4ece9; padding-top:12px; margin-top:12px; }
        .pos,.english,.example,.synonyms { font-size:13px; margin:6px 0; }
        .pos { color:#00776e; font-weight:700; }
        .english { color:#63747d; }
        .example { padding:9px 12px; background:#f3f8f5; border-radius:8px; }
        .synonyms { color:#526c65; }
        footer { margin-top:12px; font-size:11px; color:#72818a; }
      </style><section class="card" role="region" aria-label="Bản dịch"><header><span class="title"></span><button type="button" aria-label="Đóng bản dịch">×</button></header><div class="original"></div><div class="audio-controls"><button type="button" data-play="auto">▶ Nghe</button><button type="button" data-play="en-GB">Giọng UK</button><button type="button" data-play="en-US">Giọng US</button><button type="button" data-stop>Dừng</button></div><select class="voice-select" aria-label="Chọn giọng phát âm"><option value="">Tự chọn giọng tự nhiên</option></select><div class="audio-status" role="status" aria-live="polite"></div><div class="result" role="status" aria-live="polite" aria-atomic="true"></div><footer></footer></section>`;
      this.audioStatus = shadow.querySelector('.audio-status');
      this.voiceSelect = shadow.querySelector('.voice-select');
      this.on(this.voiceSelect, 'change', () => {
        const voice = global.speechSynthesis?.getVoices().find(v => (v.voiceURI || v.name) === this.voiceSelect.value);
        if (voice) {
          const lang = voice.lang.replace(/_/g, '-').toLowerCase();
          this.voicePreferences.set(lang, this.voiceSelect.value);
          this.playPronunciation(lang);
        } else { this.voicePreferences.clear(); }
      });
      const refreshVoices = () => {
        const selected = this.voiceSelect.value;
        this.voiceSelect.replaceChildren();
        const add = (value, label) => {
          const option = document.createElement('option');
          option.value = value; option.textContent = label; this.voiceSelect.append(option);
        };
        add('', 'Tự chọn giọng tự nhiên');
        for (const voice of global.speechSynthesis?.getVoices() || []) {
          if (/^en[-_]/i.test(voice.lang)) add(voice.voiceURI || voice.name, `${voice.name} · ${voice.lang}`);
        }
        this.voiceSelect.value = selected;
      };
      if (global.speechSynthesis) this.on(global.speechSynthesis, 'voiceschanged', refreshVoices);
      refreshVoices();
      shadow.querySelectorAll('[data-play]').forEach(button => {
        this.on(button, 'pointerdown', event => event.preventDefault());
        this.on(button, 'click', () => this.playPronunciation(button.dataset.play));
      });
      this.on(shadow.querySelector('[data-stop]'), 'pointerdown', event => event.preventDefault());
      this.on(shadow.querySelector('[data-stop]'), 'click', () => this.stopPlayback());
      this.title = shadow.querySelector('.title');
      this.original = shadow.querySelector('.original');
      this.result = shadow.querySelector('.result');
      this.title.textContent = `${this.source.toUpperCase()} → ${this.target.toUpperCase()}`;
      this.footer = shadow.querySelector('footer');
      this.footer.textContent = 'TDict + dịch tự động';
      document.body.append(this.host);
      this.on(shadow.querySelector('button'), 'click', () => this.hide());
      this.on(document, 'pointerdown', e => {
        this.interactingInside = e.composedPath().includes(this.host);
        clearTimeout(this.timer);
        if (this.interactingInside) return;
        this.dragging = true;
        this.hide();
      });
      this.on(document, 'pointerup', e => {
        this.dragging = false;
        if (!e.composedPath().includes(this.host)) this.schedule();
      });
      this.on(document, 'pointercancel', () => { this.dragging = false; });
      this.on(document, 'selectionchange', () => {
        if (!this.dragging && !this.interactingInside) this.schedule();
      });
      this.on(document, 'keydown', e => {
        if (e.key === 'Escape') { this.hide(); return; }
        if (e.composedPath().includes(this.host)) return;
        if (e.shiftKey && e.key.startsWith('Arrow')) {
          this.interactingInside = false;
          this.hide();
        }
      });
      this.on(window, 'resize', () => {
        if (this.current && this.anchorRect) this.position(this.anchorRect);
      });
    }
    on(target, event, handler, options) {
      target.addEventListener(event, handler, options);
      this.listeners.push(() => target.removeEventListener(event, handler, options));
    }
    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.readSelection(), 300);
    }
    readSelection() {
      if (this.interactingInside || (this.current && this.host.shadowRoot?.activeElement)) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const element = node => node.nodeType === 1 ? node : node.parentElement;
      const excluded = 'input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[data-no-translate]';
      const start = element(range.startContainer);
      const end = element(range.endContainer);
      if (!this.root.contains(range.startContainer) || !this.root.contains(range.endContainer)
        || start?.closest(excluded) || end?.closest(excluded)
        || [...this.root.querySelectorAll(excluded)].some(node => range.intersectsNode(node))) {
        return;
      }
      const text = selection.toString().trim();
      if (!text) return;
      if (this.current === text && this.host.style.display !== 'none') return;
      this.show(text, range.getBoundingClientRect());
    }
    position(rect) {
      const padding = 12;
      const box = this.host.getBoundingClientRect();
      this.host.style.left = `${Math.max(padding, Math.min(rect.left, window.innerWidth - box.width - padding))}px`;
      const below = rect.bottom + 10;
      this.host.style.top = `${Math.max(padding, Math.min(below + box.height <= window.innerHeight - padding ? below : rect.top - box.height - 10, window.innerHeight - box.height - padding))}px`;
    }
    async show(text, rect) {
      this.hide();
      const version = this.version;
      this.current = text;
      this.anchorRect = rect;
      this.audioEntry = null;
      if (this.audioStatus) this.audioStatus.textContent = 'Nghe từ hoặc đoạn đang chọn';
      this.host.style.display = 'block';
      this.original.textContent = text;
      this.result.textContent = 'Đang tra từ điển…';
      this.footer.textContent = 'TDict + dịch tự động';
      this.position(rect);
      if (new TextEncoder().encode(text).length > this.maxBytes) {
        this.result.textContent = `Đoạn đã chọn quá dài. Hãy chọn tối đa ${this.maxBytes} byte UTF-8 (một từ hoặc câu ngắn).`;
        this.position(rect); return;
      }
      const key = JSON.stringify([this.source, this.target, text]);
      const controller = new AbortController();
      this.controller = controller;
      let timeout;
      try {
        let translated = this.cache.get(key);
        if (translated === undefined) {
          const deadline = new Promise((_, reject) => {
            timeout = setTimeout(() => { reject(new Error('Dịch quá thời gian chờ. Hãy chọn lại để thử.')); controller.abort(); }, 12000);
          });
          translated = await Promise.race([Promise.resolve().then(() => this.resolve(text, {
            source: this.source, target: this.target, signal: controller.signal
          })), deadline]);
          if (!translated) throw new Error('Không tìm thấy bản dịch.');
          if (version !== this.version) return;
          if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
          if (!translated.lookupFailed) this.cache.set(key, translated);
        }
        if (version === this.version) this.render(translated);
      } catch (error) {
        if (version === this.version) this.result.textContent = error.message || 'Không dịch được. Hãy thử lại.';
      } finally {
        clearTimeout(timeout);
        if (version === this.version) this.position(rect);
      }
    }
    async defaultLookup(text, { signal }) {
      if (!this.dictionaryUrl) return null;
      if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
        const msg = 'Đang mở HTML qua file:// nên trình duyệt chặn gọi API PHP SQLite. Hãy chạy `php -S localhost:8080` và mở qua http://localhost:8080.';
        console.warn('[SelectionTranslator]', msg);
        throw new Error(msg);
      }
      const baseUri = (typeof document !== 'undefined' && document.baseURI) ? document.baseURI : 'http://localhost';
      const url = new URL(this.dictionaryUrl, baseUri);
      url.searchParams.set('q', text);
      let response;
      try {
        response = await fetch(url, { signal, credentials: 'same-origin' });
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        const msg = `Không thể kết nối API SQLite tại ${url.href}. Hãy kiểm tra xem máy chủ PHP (ví dụ: php -S localhost:8080) đã được chạy chưa.`;
        console.warn('[SelectionTranslator]', msg, err);
        throw new Error(msg);
      }
      if (!response.ok) {
        let errCode = '';
        try {
          const errData = await response.json();
          errCode = errData.error || '';
        } catch {}
        const msg = `API từ điển trả về mã HTTP ${response.status}${errCode ? ` (${errCode})` : ''}.`;
        console.warn('[SelectionTranslator]', msg);
        throw new Error(msg);
      }
      let data;
      try {
        data = await response.json();
      } catch (err) {
        const msg = 'Dữ liệu trả về không phải JSON hợp lệ. Nếu bạn đang dùng Live Server hoặc server tĩnh, file PHP sẽ không được thực thi.';
        console.warn('[SelectionTranslator]', msg);
        throw new Error(msg);
      }
      if (data.found === false) return null;
      if (data.found !== true || !data.entry || !Array.isArray(data.entry.definitions)) {
        throw new Error('Dữ liệu từ điển không hợp lệ.');
      }
      return data.entry;
    }
    async resolve(text, { source, target, signal }) {
      let lookupFailed = false;
      // The local database is English–Vietnamese. Try exact phrases as well as words.
      if (source === 'en' && target === 'vi') {
        const local = new AbortController();
        const abort = () => local.abort();
        signal.addEventListener('abort', abort, { once: true });
        let timer;
        try {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const deadline = new Promise((_, reject) => {
            timer = setTimeout(() => { reject(new Error('Lookup timeout')); local.abort(); }, this.lookupTimeout);
          });
          const entry = await Promise.race([this.lookup(text, { source, target, signal: local.signal }), deadline]);
          if (entry && Array.isArray(entry.definitions) && entry.definitions.some(d => d.definition_vi?.trim())) {
            return { type: 'dictionary', entry };
          }
        } catch (error) {
          if (signal.aborted) throw error;
          console.warn('[SelectionTranslator] Tra từ điển SQLite không khả dụng, chuyển sang dịch tự động:', error?.message || error);
          lookupFailed = true;
        } finally {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
        }
      }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const translation = await this.translate(text, { source, target, signal });
      if (typeof translation !== 'string' || !translation.trim()) throw new Error('Không tìm thấy bản dịch.');
      return { type: 'translation', translation, lookupFailed };
    }
    render(value) {
      this.audioEntry = value.type === 'dictionary' ? value.entry : null;
      this.result.replaceChildren();
      const add = (parent, tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = text;
        parent.append(node);
        return node;
      };
      if (value.type === 'translation') {
        this.result.textContent = value.translation;
        this.footer.textContent = `${value.lookupFailed ? 'TDict tạm lỗi · ' : ''}Dịch tự động (${this.translationLabel}) · Không có dữ liệu IPA / CEFR / ví dụ từ TDict`;
        return;
      }
      const entry = value.entry;
      add(this.result, 'strong', '', entry.word);
      const metadata = [entry.cefr_level && `CEFR ${entry.cefr_level}`, entry.phonetic_uk && `UK ${entry.phonetic_uk}`, entry.phonetic_us && `US ${entry.phonetic_us}`].filter(Boolean);
      if (metadata.length) add(this.result, 'div', 'meta', metadata.join(' · '));
      entry.definitions.forEach(def => {
        const sense = add(this.result, 'section', 'sense', '');
        if (def.part_of_speech) add(sense, 'div', 'pos', def.part_of_speech);
        if (def.definition_vi) add(sense, 'div', '', def.definition_vi);
        if (def.definition_en) add(sense, 'div', 'english', def.definition_en);
        if (def.example_en || def.example_vi) add(sense, 'div', 'example', [def.example_en, def.example_vi].filter(Boolean).join('\n'));
        if (Array.isArray(def.synonyms) && def.synonyms.length) add(sense, 'div', 'synonyms', `Đồng nghĩa: ${def.synonyms.join(' · ')}`);
      });
      this.footer.textContent = 'Nguồn: TDict';
    }
    async defaultTranslate(text, { source, target, signal }) {
      const url = new URL('https://api.mymemory.translated.net/get');
      url.search = new URLSearchParams({ q: text, langpair: `${source}|${target}` }).toString();
      const response = await fetch(url, { signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Dịch vụ dịch đang bận. Hãy thử lại sau.');
      const data = await response.json();
      if (Number(data.responseStatus) !== 200 || data.quotaFinished) throw new Error('Dịch vụ không khả dụng hoặc đã hết hạn mức. Hãy thử lại sau.');
      return data.responseData?.translatedText;
    }
    chooseVoice(voices, preferred) {
      const chosen = voices.find(v => (v.voiceURI || v.name) === preferred);
      if (chosen) return chosen;
      // macOS includes novelty voices in en-US; never pick one automatically.
      const novelty = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Trinoids|Whisper|Zarvox|Wobble/i;
      const score = voice => /Google|Natural|Neural|Premium|Enhanced/i.test(voice.name) ? 100
        : /Samantha|Alex|Ava|Allison|Tom|Siri|Daniel|Serena/i.test(voice.name) ? 80
        : voice.default ? 50 : 10;
      return voices.filter(v => !novelty.test(v.name)).sort((a, b) => score(b) - score(a))[0];
    }
    stopPlayback() {
      this.playbackId = (this.playbackId || 0) + 1;
      clearTimeout(this.audioTimer);
      this.cancelVoiceWait?.();
      this.cancelVoiceWait = null;
      if (this.audio) {
        this.audio.onended = null;
        this.audio.onerror = null;
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
        this.audio = null;
      }
      if (this.utterance) {
        this.utterance.onend = null;
        this.utterance.onerror = null;
        global.speechSynthesis?.cancel();
        this.utterance = null;
      }
      if (this.audioStatus) this.audioStatus.textContent = '';
    }
    playPronunciation(mode = 'auto') {
      this.stopPlayback();
      const text = this.audioEntry?.word || this.current;
      if (!text) return;
      const id = this.playbackId;
      const say = (waited = false) => {
        if (id !== this.playbackId) return;
        const synth = global.speechSynthesis;
        if (!synth || !global.SpeechSynthesisUtterance) {
          this.audioStatus.textContent = 'Trình duyệt chưa hỗ trợ đọc. Hãy thử Chrome hoặc Safari.';
          return;
        }
        const lang = mode === 'auto' ? this.speechLang : mode;
        const voices = synth.getVoices().filter(v => v.lang.replace(/_/g, '-').toLowerCase() === lang.toLowerCase());
        if (!voices.length && !waited) {
          this.audioStatus.textContent = 'Đang tải danh sách giọng đọc…';
          let timer;
          const cleanup = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', ready); };
          const ready = () => { cleanup(); this.cancelVoiceWait = null; if (id === this.playbackId) say(true); };
          this.cancelVoiceWait = cleanup;
          synth.addEventListener('voiceschanged', ready, { once: true });
          timer = setTimeout(ready, 1500);
          return;
        }
        const preferred = this.voicePreferences?.get(lang.toLowerCase());
        const voice = this.chooseVoice(voices, preferred);
        if (!voice) {
          this.audioStatus.textContent = `Thiết bị chưa có giọng ${lang}. Chọn giọng khác trong danh sách hoặc cài giọng này trên thiết bị.`;
          return;
        }
        if (this.voiceSelect) this.voiceSelect.value = voice.voiceURI || voice.name;
        const utterance = new global.SpeechSynthesisUtterance(text);
        this.utterance = utterance;
        utterance.lang = lang;
        utterance.rate = 0.9;
        if (voice) utterance.voice = voice;
        this.audioStatus.textContent = `Đang đọc · ${voice ? voice.name : `giọng mặc định (${lang})`}`;
        utterance.onend = () => {
          if (id === this.playbackId) { this.audioStatus.textContent = 'Đã đọc xong'; this.utterance = null; }
        };
        utterance.onerror = () => {
          if (id === this.playbackId) { this.audioStatus.textContent = 'Không đọc được. Hãy kiểm tra giọng đọc trên thiết bị hoặc thử trình duyệt khác.'; this.utterance = null; }
        };
        try { synth.speak(utterance); } catch { utterance.onerror(); }
      };
      let url;
      if (mode === 'auto' && this.audioEntry?.audio_url) {
        try {
          const candidate = new URL(this.audioEntry.audio_url, document.baseURI);
          if (candidate.protocol === 'https:' || (candidate.protocol === 'http:' && candidate.origin === new URL(document.baseURI).origin)) url = candidate.href;
        } catch { /* Invalid audio URLs use browser speech. */ }
      }
      if (!url) { say(); return; }
      const audio = new global.Audio(url);
      this.audio = audio;
      let failed = false;
      const fallback = () => {
        if (id !== this.playbackId || failed) return;
        failed = true;
        clearTimeout(this.audioTimer);
        audio.onerror = null;
        audio.onended = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        this.audio = null;
        say();
      };
      this.audioStatus.textContent = 'Đang tải audio từ điển…';
      audio.onerror = fallback;
      audio.onended = () => { if (id === this.playbackId) this.audioStatus.textContent = 'Đã phát xong · audio từ điển'; };
      this.audioTimer = setTimeout(fallback, 5000);
      try {
        Promise.resolve(audio.play()).then(() => {
          if (id !== this.playbackId || failed) return;
          clearTimeout(this.audioTimer);
          this.audioStatus.textContent = 'Đang phát · audio từ điển';
        }).catch(fallback);
      } catch { fallback(); }
    }
    hide() {
      this.stopPlayback();
      clearTimeout(this.timer);
      this.version++;
      this.controller?.abort();
      this.host.style.display = 'none';
      this.current = null;
    }
    destroy() {
      this.hide();
      this.listeners.forEach(remove => remove());
      this.host.remove();
      this.cache.clear();
    }
  }
  global.SelectionTranslator = SelectionTranslator;
})(window);
