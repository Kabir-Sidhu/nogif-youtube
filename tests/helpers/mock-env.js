'use strict';

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function splitTopLevel(selector, delimiter) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '[') {
      depth += 1;
      current += ch;
    } else if (ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (depth === 0 && ch === delimiter) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function tokenizeChain(selector) {
  const tokens = [];
  let depth = 0;
  let quote = null;
  let buf = '';
  let pendingCombinator = null;

  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === '[') {
      depth += 1;
      buf += ch;
    } else if (ch === ']') {
      depth = Math.max(0, depth - 1);
      buf += ch;
    } else if (depth === 0 && (ch === '>' || /\s/.test(ch))) {
      if (buf) {
        tokens.push({ combinator: pendingCombinator, simple: buf });
        buf = '';
        pendingCombinator = ' ';
      }
      if (ch === '>') pendingCombinator = '>';
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push({ combinator: pendingCombinator, simple: buf });
  return tokens;
}

function matchesSimple(el, simple) {
  if (!el || el.nodeType !== 1) return false;
  let rest = simple;
  const attrRegex = /\[([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g;
  let match;
  while ((match = attrRegex.exec(simple)) !== null) {
    const attrName = match[1];
    const expected = match[2] ?? match[3] ?? match[4];
    if (!el.hasAttribute(attrName)) return false;
    if (expected !== undefined && el.getAttribute(attrName) !== expected) return false;
  }
  rest = rest.replace(attrRegex, '');

  const idMatch = rest.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    if (el.id !== idMatch[1]) return false;
    rest = rest.replace(/#[a-zA-Z0-9_-]+/, '');
  }

  const parts = rest.split('.');
  const tag = parts[0].trim();
  if (tag && tag !== '*' && el.tagName.toLowerCase() !== tag.toLowerCase()) {
    return false;
  }
  for (let i = 1; i < parts.length; i += 1) {
    if (parts[i] && !el.classList.contains(parts[i])) return false;
  }
  return true;
}

function matchesChainAt(el, tokens, index) {
  if (!matchesSimple(el, tokens[index].simple)) return false;
  if (index === 0) return true;
  const comb = tokens[index].combinator;
  if (comb === '>') {
    return Boolean(el.parentElement) && matchesChainAt(el.parentElement, tokens, index - 1);
  }
  let ancestor = el.parentElement;
  while (ancestor) {
    if (matchesChainAt(ancestor, tokens, index - 1)) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

function matchesSelector(el, selectorGroup) {
  return splitTopLevel(selectorGroup, ',').some((sel) => {
    const tokens = tokenizeChain(sel);
    return tokens.length > 0 && matchesChainAt(el, tokens, tokens.length - 1);
  });
}

function createDomMock() {
  const activeObservers = new Set();
  const pendingMutations = [];
  const rafQueue = new Map();
  let nextRafId = 1;

  class MockElement {
    constructor(tagName, ownerDocument) {
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.ownerDocument = ownerDocument;
      this.parentElement = null;
      this.children = [];
      this.style = {};
      this.checked = false;
      this.value = '';
      this.disabled = false;
      this._text = '';
      this._attrs = new Map();
      this._listeners = new Map();

      const self = this;
      this.classList = {
        _set() {
          return new Set((self.getAttribute('class') || '').split(/\s+/).filter(Boolean));
        },
        _save(set) {
          if (set.size === 0) self.removeAttribute('class');
          else self.setAttribute('class', Array.from(set).join(' '));
        },
        add(...names) {
          const s = this._set();
          names.forEach((n) => s.add(n));
          this._save(s);
        },
        remove(...names) {
          const s = this._set();
          names.forEach((n) => s.delete(n));
          this._save(s);
        },
        contains(name) {
          return this._set().has(name);
        },
        toggle(name, force) {
          const s = this._set();
          const shouldHave = force !== undefined ? Boolean(force) : !s.has(name);
          if (shouldHave) s.add(name);
          else s.delete(name);
          this._save(s);
          return shouldHave;
        },
      };

      this.dataset = new Proxy({}, {
        get(_, prop) {
          if (typeof prop !== 'string') return undefined;
          const val = self.getAttribute(`data-${camelToKebab(prop)}`);
          return val === null ? undefined : val;
        },
        set(_, prop, val) {
          self.setAttribute(`data-${camelToKebab(String(prop))}`, String(val));
          return true;
        },
        deleteProperty(_, prop) {
          self.removeAttribute(`data-${camelToKebab(String(prop))}`);
          return true;
        },
        has(_, prop) {
          return typeof prop === 'string' && self.hasAttribute(`data-${camelToKebab(prop)}`);
        },
      });
    }

    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', String(v)); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', String(v)); }
    get type() { return this.getAttribute('type') || ''; }
    set type(v) { this.setAttribute('type', String(v)); }
    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', String(v)); }
    get src() { return this.getAttribute('src') || ''; }
    set src(v) {
      if (v === '' || v === null || v === undefined) this.removeAttribute('src');
      else this.setAttribute('src', String(v));
    }

    get textContent() {
      return this._text + this.children.map((c) => c.textContent).join('');
    }
    set textContent(val) {
      const removed = this.children.slice();
      removed.forEach((c) => { c.parentElement = null; });
      this.children = [];
      this._text = String(val ?? '');
      if (removed.length > 0) this.ownerDocument._recordMutation(this, [], removed);
    }

    setAttribute(name, value) { this._attrs.set(name.toLowerCase(), String(value)); }
    getAttribute(name) {
      const k = name.toLowerCase();
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    }
    hasAttribute(name) { return this._attrs.has(name.toLowerCase()); }
    removeAttribute(name) { this._attrs.delete(name.toLowerCase()); }

    appendChild(child) {
      if (child.parentElement) child.remove();
      child.parentElement = this;
      this.children.push(child);
      this.ownerDocument._recordMutation(this, [child], []);
      return child;
    }

    insertBefore(newNode, refNode) {
      if (!refNode) return this.appendChild(newNode);
      if (newNode.parentElement) newNode.remove();
      const idx = this.children.indexOf(refNode);
      newNode.parentElement = this;
      if (idx === -1) this.children.push(newNode);
      else this.children.splice(idx, 0, newNode);
      this.ownerDocument._recordMutation(this, [newNode], []);
      return newNode;
    }

    remove() {
      if (!this.parentElement) return;
      const parent = this.parentElement;
      const idx = parent.children.indexOf(this);
      if (idx !== -1) parent.children.splice(idx, 1);
      this.parentElement = null;
      this.ownerDocument._recordMutation(parent, [], [this]);
    }

    matches(selector) { return matchesSelector(this, selector); }
    closest(selector) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (cur.matches(selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) results.push(child);
          visit(child);
        }
      };
      visit(this);
      return results;
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      if (this._listeners.has(type)) this._listeners.get(type).delete(fn);
    }
    dispatchEvent(event) {
      const evt = typeof event === 'string' ? { type: event } : event;
      evt.target = evt.target || this;
      evt.currentTarget = this;
      const set = this._listeners.get(evt.type);
      if (set) Array.from(set).forEach((fn) => fn(evt));
      return true;
    }
    click() {
      if (this.tagName === 'INPUT' && this.type === 'checkbox') this.checked = !this.checked;
      if (this.tagName === 'INPUT' && this.type === 'radio') this.checked = true;
      this.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
    }
  }

  const document = {
    location: { href: 'https://www.youtube.com/watch?v=a' },
    nodeType: 9,
    _listeners: new Map(),
    createElement(tag) { return new MockElement(tag, document); },
    getElementById(id) { return document.documentElement.querySelector(`#${id}`); },
    querySelector(sel) { return document.documentElement.querySelector(sel); },
    querySelectorAll(sel) { return document.documentElement.querySelectorAll(sel); },
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (this._listeners.has(type)) this._listeners.get(type).delete(fn);
    },
    dispatchEvent(event) {
      const evt = typeof event === 'string' ? { type: event } : event;
      const set = this._listeners.get(evt.type);
      if (set) Array.from(set).forEach((fn) => fn(evt));
      return true;
    },
    listenerCount(type) {
      return this._listeners.has(type) ? this._listeners.get(type).size : 0;
    },
    _recordMutation(target, addedNodes, removedNodes) {
      for (const obs of activeObservers) {
        for (const reg of obs._targets) {
          let relevant = reg.target === target;
          if (!relevant && reg.options.subtree) {
            let cur = target;
            while (cur) {
              if (cur === reg.target || (reg.target === document && cur === document.documentElement)) {
                relevant = true;
                break;
              }
              cur = cur.parentElement;
            }
          }
          if (relevant) {
            pendingMutations.push({ obs, record: { type: 'childList', target, addedNodes, removedNodes } });
            break;
          }
        }
      }
    },
  };

  document.documentElement = new MockElement('html', document);
  document.head = new MockElement('head', document);
  document.body = new MockElement('body', document);
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);

  class MockMutationObserver {
    constructor(callback) {
      this._callback = callback;
      this._targets = [];
    }
    observe(target, options = {}) {
      this._targets.push({ target, options });
      activeObservers.add(this);
    }
    disconnect() {
      this._targets = [];
      activeObservers.delete(this);
    }
  }

  class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail ?? null;
    }
  }

  function requestAnimationFrame(cb) {
    const id = nextRafId;
    nextRafId += 1;
    rafQueue.set(id, cb);
    return id;
  }
  function cancelAnimationFrame(id) { rafQueue.delete(id); }

  function flushMutations() {
    while (pendingMutations.length > 0) {
      const grouped = new Map();
      for (const item of pendingMutations.splice(0)) {
        if (!activeObservers.has(item.obs)) continue;
        if (!grouped.has(item.obs)) grouped.set(item.obs, []);
        grouped.get(item.obs).push(item.record);
      }
      for (const [obs, records] of grouped.entries()) {
        obs._callback(records, obs);
      }
    }
  }

  function flushAnimationFrames() {
    const callbacks = Array.from(rafQueue.values());
    rafQueue.clear();
    callbacks.forEach((cb) => cb(Date.now()));
  }

  function flushAll() {
    flushMutations();
    flushAnimationFrames();
    flushMutations();
  }

  return {
    document,
    MutationObserver: MockMutationObserver,
    CustomEvent: MockCustomEvent,
    requestAnimationFrame,
    cancelAnimationFrame,
    flushMutations,
    flushAnimationFrames,
    flushAll,
    getActiveObserverCount: () => activeObservers.size,
    getPendingRafCount: () => rafQueue.size,
    installGlobals(target = globalThis) {
      const prev = {
        document: target.document,
        window: target.window,
        MutationObserver: target.MutationObserver,
        CustomEvent: target.CustomEvent,
        requestAnimationFrame: target.requestAnimationFrame,
        cancelAnimationFrame: target.cancelAnimationFrame,
      };
      target.document = document;
      target.window = { document, requestAnimationFrame, cancelAnimationFrame };
      target.MutationObserver = MockMutationObserver;
      target.CustomEvent = MockCustomEvent;
      target.requestAnimationFrame = requestAnimationFrame;
      target.cancelAnimationFrame = cancelAnimationFrame;
      return () => { Object.assign(target, prev); };
    },
  };
}

function createBrowserMock(options = {}) {
  const syncStore = { ...(options.initialSync || {}) };
  const localStore = { ...(options.initialLocal || {}) };
  const onChangedListeners = new Set();
  const onMessageListeners = new Set();
  const onActivatedListeners = new Set();
  const onRemovedListeners = new Set();
  const sentMessages = [];
  const badgeTexts = [];
  const badgeColors = [];
  const activeTabs = options.activeTabs || [
    { id: 101, active: true, currentWindow: true, url: 'https://www.youtube.com/watch?v=LyHdZe5GFd8' },
  ];
  const tabResponders = new Map();

  const api = { runtime: { lastError: null } };

  function finish(err, value, cb) {
    if (typeof cb === 'function') {
      api.runtime.lastError = err ? { message: err.message } : null;
      cb(err ? undefined : value);
      api.runtime.lastError = null;
      return undefined;
    }
    if (options.callbackOnly) {
      throw new TypeError('Callback required in callback-only Chrome API');
    }
    return err ? Promise.reject(err) : Promise.resolve(value);
  }

  function makeStorageArea(areaName, store, getErrFn, setErrFn) {
    return {
      _store: store,
      get(keys, cb) {
        const err = getErrFn ? getErrFn(keys) : null;
        if (err) return finish(err, undefined, cb);
        let res = {};
        if (keys === null || keys === undefined) {
          res = { ...store };
        } else if (typeof keys === 'string') {
          if (keys in store) res[keys] = store[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach((k) => { if (k in store) res[k] = store[k]; });
        } else if (typeof keys === 'object') {
          for (const [k, defVal] of Object.entries(keys)) {
            res[k] = (k in store) ? store[k] : defVal;
          }
        }
        return finish(null, res, cb);
      },
      set(items, cb) {
        const err = setErrFn ? setErrFn(items) : null;
        if (err) return finish(err, undefined, cb);
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: store[k], newValue: v };
          store[k] = v;
        }
        if (Object.keys(changes).length > 0) {
          Array.from(onChangedListeners).forEach((fn) => fn(changes, areaName));
        }
        return finish(null, undefined, cb);
      },
      remove(keys, cb) {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        list.forEach((k) => {
          if (k in store) {
            changes[k] = { oldValue: store[k] };
            delete store[k];
          }
        });
        if (Object.keys(changes).length > 0) {
          Array.from(onChangedListeners).forEach((fn) => fn(changes, areaName));
        }
        return finish(null, undefined, cb);
      },
      clear(cb) {
        const changes = {};
        for (const k of Object.keys(store)) {
          changes[k] = { oldValue: store[k] };
          delete store[k];
        }
        if (Object.keys(changes).length > 0) {
          Array.from(onChangedListeners).forEach((fn) => fn(changes, areaName));
        }
        return finish(null, undefined, cb);
      },
    };
  }

  api.storage = {
    sync: options.syncDisabled ? undefined : makeStorageArea('sync', syncStore, options.syncGetError, options.syncSetError),
    local: makeStorageArea('local', localStore, options.localGetError, options.localSetError),
    onChanged: {
      addListener(fn) { onChangedListeners.add(fn); },
      removeListener(fn) { onChangedListeners.delete(fn); },
    },
  };

  function dispatchMessage(message, sender = { tab: activeTabs[0] || { id: 101 } }) {
    return new Promise((resolve) => {
      let handledAsync = false;
      let syncResp;
      for (const listener of Array.from(onMessageListeners)) {
        const ret = listener(message, sender, (resp) => {
          syncResp = resp;
          resolve(resp);
        });
        if (ret === true) handledAsync = true;
      }
      if (!handledAsync) resolve(syncResp);
    });
  }

  api.runtime.onMessage = {
    addListener(fn) { onMessageListeners.add(fn); },
    removeListener(fn) { onMessageListeners.delete(fn); },
  };
  api.runtime.sendMessage = (message, cb) => {
    sentMessages.push(message);
    const p = dispatchMessage(message);
    if (cb) p.then(cb);
    return options.callbackOnly ? undefined : p;
  };

  api.action = {
    setBadgeText(details, cb) {
      badgeTexts.push(details);
      return finish(null, undefined, cb);
    },
    setBadgeBackgroundColor(details, cb) {
      badgeColors.push(details);
      return finish(null, undefined, cb);
    },
  };

  api.tabs = {
    query(queryInfo, cb) { return finish(null, activeTabs.slice(), cb); },
    sendMessage(tabId, msg, cb) {
      const handler = tabResponders.get(tabId);
      const val = handler ? handler(msg) : undefined;
      return finish(null, val, cb);
    },
    onActivated: {
      addListener(fn) { onActivatedListeners.add(fn); },
      removeListener(fn) { onActivatedListeners.delete(fn); },
    },
    onRemoved: {
      addListener(fn) { onRemovedListeners.add(fn); },
      removeListener(fn) { onRemovedListeners.delete(fn); },
    },
  };

  return {
    api,
    syncStore,
    localStore,
    sentMessages,
    badgeTexts,
    badgeColors,
    activeTabs,
    dispatchMessage,
    registerTabResponder(tabId, fn) { tabResponders.set(tabId, fn); },
    async triggerTabActivated(tabId, windowId = 1) {
      for (const fn of Array.from(onActivatedListeners)) await fn({ tabId, windowId });
    },
    async triggerTabRemoved(tabId) {
      for (const fn of Array.from(onRemovedListeners)) await fn(tabId, { windowId: 1, isWindowClosing: false });
    },
    installAs(target = globalThis, mode = 'chrome') {
      const prevChrome = target.chrome;
      const prevBrowser = target.browser;
      delete target.chrome;
      delete target.browser;
      if (mode === 'browser') target.browser = api;
      else target.chrome = api;
      return () => {
        delete target.chrome;
        delete target.browser;
        if (prevChrome !== undefined) target.chrome = prevChrome;
        if (prevBrowser !== undefined) target.browser = prevBrowser;
      };
    },
  };
}

module.exports = { createBrowserMock, createDomMock };
