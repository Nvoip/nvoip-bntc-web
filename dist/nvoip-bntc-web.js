(function () {
  'use strict';

  var script = document.currentScript;
  var TOKEN_RE = /\{nvoip_bntc(?::([a-z0-9_-]+))?\}/gi;
  var debug = new URLSearchParams(window.location.search || '').get('nvoip_bntc_debug') === '1';
  var state = {
    config: null,
    permission: 'unknown',
    geolocation: 'not_started',
    position: null,
    result: {},
    error: null
  };

  window.nvoipBntcDebug = state;

  function assign(target, patch) {
    Object.keys(patch || {}).forEach(function (key) {
      target[key] = patch[key];
    });
    return target;
  }

  function renderDebug() {
    if (!debug) return;
    var panel = document.getElementById('nvoip-bntc-debug-panel');
    if (!panel) {
      panel = document.createElement('pre');
      panel.id = 'nvoip-bntc-debug-panel';
      panel.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:999999;max-height:45vh;overflow:auto;background:#111;color:#f5f5f5;padding:12px;border-radius:6px;font:12px/1.4 monospace;white-space:pre-wrap;text-align:left;';
      document.body.appendChild(panel);
    }
    panel.textContent = 'Nvoip BNTC Debug\n' + JSON.stringify(state, null, 2);
  }

  function setState(patch) {
    assign(state, patch);
    renderDebug();
  }

  function digits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function groupName(value) {
    value = String(value || 'default').toLowerCase().replace(/[^a-z0-9_-]+/g, '');
    return value || 'default';
  }

  function numberGroup(number) {
    return groupName(number && number.group);
  }

  function normalizeConfig(config) {
    config = config || {};
    return assign({
      defaultNumber: '',
      format: 'national',
      cacheHours: 24,
      maxDistanceKm: 450,
      ipFallback: true,
      ipGeoUrl: 'https://get.geojs.io/v1/ip/geo.json',
      numbers: [],
      specialNumbers: []
    }, config);
  }

  function cacheKey(group) {
    return 'nvoip_bntc_web_' + group + '_' + (window.location.pathname || '/');
  }

  function getCached(group, hours) {
    if (debug) return null;
    try {
      var cached = JSON.parse(localStorage.getItem(cacheKey(group)) || 'null');
      if (cached && cached.savedAt && Date.now() - cached.savedAt < hours * 3600000) {
        return cached.payload;
      }
    } catch (error) {}
    return null;
  }

  function setCached(group, payload) {
    try {
      localStorage.setItem(cacheKey(group), JSON.stringify({ savedAt: Date.now(), payload: payload }));
    } catch (error) {}
  }

  function formatPhone(phone, format) {
    var raw = digits(phone);
    if (!raw) return '';
    if (format === 'raw') return raw;
    if (format === 'e164') return '+' + raw;

    if (raw.indexOf('55') === 0) {
      var br = raw.slice(2);
      if (br.indexOf('800') === 0) {
        return '0800 ' + br.slice(3, 6) + ' ' + br.slice(6);
      }
      if (br.length === 10) {
        return '(' + br.slice(0, 2) + ') ' + br.slice(2, 6) + '-' + br.slice(6);
      }
      if (br.length === 11) {
        return '(' + br.slice(0, 2) + ') ' + br.slice(2, 7) + '-' + br.slice(7);
      }
    }

    if (raw.indexOf('1') === 0 && raw.length === 11) {
      return '+1 (' + raw.slice(1, 4) + ') ' + raw.slice(4, 7) + '-' + raw.slice(7);
    }

    if (format === 'spaces') {
      return '+' + raw.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
    }

    return '+' + raw;
  }

  function distanceKm(aLat, aLng, bLat, bLng) {
    var toRad = Math.PI / 180;
    var dLat = (bLat - aLat) * toRad;
    var dLng = (bLng - aLng) * toRad;
    var lat1 = aLat * toRad;
    var lat2 = bLat * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function pathAllowed(rule) {
    var allowed = rule.allowedPaths || rule.paths || [];
    var blocked = rule.blockedPaths || [];
    var path = window.location.pathname || '/';

    function match(pattern) {
      pattern = String(pattern || '').trim();
      if (!pattern) return false;
      if (pattern.slice(-1) === '*') return path.indexOf(pattern.slice(0, -1)) === 0;
      return path === pattern;
    }

    if (blocked.some(match)) return false;
    if (!allowed.length) return true;
    return allowed.some(match);
  }

  function areaAllowed(rule, areaCode) {
    var eligible = rule.eligibleAreaCodes || rule.eligible_area_codes || [];
    if (!eligible.length) return true;
    return eligible.map(String).indexOf(String(areaCode || '')) !== -1;
  }

  function payload(number, source, format) {
    return {
      phone: digits(number.phone),
      formatted: formatPhone(number.phone, format),
      label: number.label || number.city || number.phone,
      source: source
    };
  }

  function chooseNumber(config, context, group) {
    var format = config.format || 'national';
    var candidates = (config.numbers || []).filter(function (number) {
      return number && number.phone && number.enabled !== false && numberGroup(number) === group;
    });
    var specials = (config.specialNumbers || []).filter(function (rule) {
      return rule && rule.phone && rule.enabled !== false && numberGroup(rule) === group && pathAllowed(rule);
    });

    var local = null;
    if (context && context.latitude && context.longitude) {
      candidates.forEach(function (number) {
        if (number.lat === undefined || number.lng === undefined) return;
        var distance = distanceKm(Number(context.latitude), Number(context.longitude), Number(number.lat), Number(number.lng));
        if (distance > Number(config.maxDistanceKm || 450)) return;
        var score = distance - (Number(number.priority || 0) * 5);
        if (!local || score < local.score) {
          local = { number: number, score: score, distance: distance };
        }
      });
    }

    if (!local && context && context.country) {
      candidates.forEach(function (number) {
        var score = 1000 - Number(number.priority || 0);
        if (String(number.country || '').toUpperCase() === String(context.country || '').toUpperCase()) score -= 300;
        if (context.region && String(number.state || '').toUpperCase() === String(context.region || '').toUpperCase()) score -= 150;
        if (context.city && String(number.city || '').toLowerCase() === String(context.city || '').toLowerCase()) score -= 200;
        if (context.areaCode && String(number.areaCode || number.area_code || '') === String(context.areaCode)) score -= 100;
        if (!local || score < local.score) local = { number: number, score: score };
      });
    }

    var override = specials.filter(function (rule) {
      return String(rule.mode || 'fallback') === 'override' && areaAllowed(rule, context && context.areaCode);
    })[0];
    if (override) return payload(override, 'special_override', format);

    if (local) return payload(local.number, 'local', format);

    var fallback = specials.filter(function (rule) {
      return areaAllowed(rule, context && context.areaCode);
    })[0];
    if (fallback) return payload(fallback, 'special_fallback', format);

    return payload({ phone: config.defaultNumber, label: 'Default' }, 'default', format);
  }

  function collectTargets() {
    replaceTextTokens();
    var targets = Array.prototype.slice.call(document.querySelectorAll('[data-nvoip-bntc], .nvoip-bntc-phone'));
    Array.prototype.slice.call(document.querySelectorAll('a[href*="{nvoip_bntc"]')).forEach(function (link) {
      link.setAttribute('data-nvoip-bntc-link', '1');
      var match = String(link.getAttribute('href') || '').match(TOKEN_RE);
      if (match && !link.getAttribute('data-bntc-group')) {
        link.setAttribute('data-bntc-group', groupName(String(match[0]).replace(/[{}]/g, '').split(':')[1]));
      }
    });
    return targets;
  }

  function replaceTextTokens() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!TOKEN_RE.test(node.nodeValue || '')) return NodeFilter.FILTER_REJECT;
        TOKEN_RE.lastIndex = 0;
        var parent = node.parentElement;
        if (!parent || /^(script|style|textarea|code)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      var text = node.nodeValue || '';
      var last = 0;
      text.replace(TOKEN_RE, function (match, group, offset) {
        frag.appendChild(document.createTextNode(text.slice(last, offset)));
        var span = document.createElement('span');
        span.setAttribute('data-nvoip-bntc', '1');
        span.setAttribute('data-bntc-group', groupName(group));
        span.textContent = match;
        frag.appendChild(span);
        last = offset + match.length;
      });
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function groups(targets) {
    var map = {};
    targets.forEach(function (node) {
      map[groupName(node.getAttribute('data-bntc-group'))] = true;
    });
    Array.prototype.slice.call(document.querySelectorAll('[data-nvoip-bntc-link="1"]')).forEach(function (link) {
      map[groupName(link.getAttribute('data-bntc-group'))] = true;
    });
    if (!Object.keys(map).length) map.default = true;
    return Object.keys(map);
  }

  function applyNumber(group, selected) {
    state.result[group] = selected;
    Array.prototype.slice.call(document.querySelectorAll('[data-nvoip-bntc], .nvoip-bntc-phone')).forEach(function (node) {
      if (groupName(node.getAttribute('data-bntc-group')) !== group) return;
      node.textContent = selected.formatted || selected.phone;
      node.setAttribute('data-bntc-phone', selected.phone);
      node.setAttribute('data-bntc-source', selected.source || '');
      var link = node.closest && node.closest('a');
      if (link && (!link.getAttribute('href') || link.getAttribute('href').indexOf('tel:') === 0 || link.getAttribute('href').indexOf('{nvoip_bntc') !== -1)) {
        link.setAttribute('href', 'tel:+' + digits(selected.phone));
      }
    });
    Array.prototype.slice.call(document.querySelectorAll('[data-nvoip-bntc-link="1"]')).forEach(function (link) {
      if (groupName(link.getAttribute('data-bntc-group')) !== group) return;
      link.setAttribute('href', 'tel:+' + digits(selected.phone));
    });
    renderDebug();
  }

  function applyForGroups(config, context, groupList) {
    groupList.forEach(function (group) {
      var cached = getCached(group, Number(config.cacheHours || 24));
      if (cached) {
        applyNumber(group, cached);
        return;
      }
      var selected = chooseNumber(config, context || {}, group);
      applyNumber(group, selected);
      setCached(group, selected);
    });
  }

  function ipFallback(config) {
    if (!config.ipFallback || !window.fetch) return Promise.resolve({});
    return fetch(config.ipGeoUrl, { credentials: 'omit' })
      .then(function (response) { return response.ok ? response.json() : {}; })
      .then(function (geo) {
        return {
          latitude: Number(geo.latitude || geo.lat || 0) || undefined,
          longitude: Number(geo.longitude || geo.lon || 0) || undefined,
          city: geo.city || '',
          region: geo.region || geo.region_code || '',
          country: geo.country_code || geo.country || ''
        };
      })
      .catch(function (error) {
        setState({ error: String(error && error.message ? error.message : error) });
        return {};
      });
  }

  function locate(config) {
    var params = new URLSearchParams(window.location.search || '');
    var forcedLat = params.get('nvoip_bntc_lat');
    var forcedLng = params.get('nvoip_bntc_lng');
    if (forcedLat !== null && forcedLng !== null) {
      setState({ geolocation: 'forced_by_url', position: { latitude: Number(forcedLat), longitude: Number(forcedLng) } });
      return Promise.resolve({ latitude: Number(forcedLat), longitude: Number(forcedLng) });
    }
    if (!navigator.geolocation) {
      setState({ geolocation: 'unsupported' });
      return ipFallback(config);
    }
    setState({ geolocation: 'requesting' });
    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(function (position) {
        var context = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setState({ geolocation: 'granted', position: context });
        resolve(context);
      }, function (error) {
        setState({ geolocation: 'failed', error: { code: error && error.code, message: error && error.message } });
        ipFallback(config).then(resolve);
      }, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: Number(config.cacheHours || 24) * 3600000
      });
    });
  }

  function loadConfig() {
    var inline = window.NvoipBNTC || window.nvoipBntcConfig;
    var configUrl = script && script.getAttribute('data-config');
    if (inline) return Promise.resolve(normalizeConfig(inline));
    if (configUrl && window.fetch) {
      return fetch(configUrl, { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('Nvoip BNTC config not found');
          return response.json();
        })
        .then(normalizeConfig);
    }
    return Promise.resolve(normalizeConfig({}));
  }

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' })
      .then(function (status) {
        setState({ permission: status.state });
        status.onchange = function () { setState({ permission: status.state }); };
      })
      .catch(function () {});
  }

  function boot() {
    loadConfig().then(function (config) {
      setState({ config: config });
      var targets = collectTargets();
      var groupList = groups(targets);
      locate(config).then(function (context) {
        applyForGroups(config, context, groupList);
      });
    }).catch(function (error) {
      setState({ error: String(error && error.message ? error.message : error) });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
