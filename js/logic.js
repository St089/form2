/* logic.js – wizard navigácia, validácie, show/hide, reset, prefill (bez backendu) */
(() => {
  'use strict';

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ERROR = {
    required: 'Toto pole je povinné.',
    fullName: 'Zadajte meno aj priezvisko (aspoň 2 slová).',
    email: 'Zadajte platný e-mail.',
    phone: 'Zadajte telefón v správnom formáte.',
    url: 'Doplňte URL.',
    chooseOne: 'Vyberte jednu možnosť.',
    upload: 'Nahrajte súbor.',
  };

  const getTokenFromUrl = () => {
    const t = new URLSearchParams(window.location.search).get('t');
    return (t && t.trim()) ? t.trim() : '';
  };

  const normalizeSpaces = (s) => s.replace(/\s+/g, ' ').trim();

  const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

  const isValidUrl = (s) => {
    try { new URL(s.trim()); return true; } catch { return false; }
  };

  const setInvalid = (fieldEl, message) => {
    fieldEl.classList.add('is-invalid', 'is-shake');
    const err = $('.ui-error', fieldEl);
    if (err) err.textContent = message;
    window.setTimeout(() => fieldEl.classList.remove('is-shake'), 380);
  };

  const clearInvalid = (fieldEl) => {
    fieldEl.classList.remove('is-invalid');
    const err = $('.ui-error', fieldEl);
    if (err) err.textContent = '';
  };

  const resetContainer = (container) => {
    // Reset all input/textarea/select in a container + collapse inline/reveal
    $$('input, textarea, select', container).forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
      else if (el.type === 'file') el.value = '';
      else el.value = '';
    });

    // Reset upload meta
    $$('[data-filelist]', container).forEach((node) => node.textContent = '');

    // Collapse
    $$('.ui-inline, .ui-reveal', container).forEach((node) => node.classList.add('is-hidden'));
    $$('.is-invalid', container).forEach((node) => clearInvalid(node));

    // Special: social URLs hidden JSON
    const hiddenSocial = $('#x_social_urls');
    if (hiddenSocial) hiddenSocial.value = '{}';
  };

  // -----------------------------
  // Wizard
  // -----------------------------
  const cards = $$('[data-card]');
  let index = 0;

  const updateProgress = () => {
    const card = cards[index];
    const progress = $('#jsProgress');
    if (!progress || !card) return;

    if (card.dataset.kind === 'intro') {
      progress.classList.add('is-hidden');
      return;
    }
    progress.classList.remove('is-hidden');

    const step = Number(card.dataset.step || 1);
    const stepTotal = Number(card.dataset.stepTotal || 9);

    $('#jsProgressLeft').textContent = `Krok ${step}/${stepTotal}`;

    const q = card.dataset.question ? Number(card.dataset.question) : null;
    const qTotal = card.dataset.questionTotal ? Number(card.dataset.questionTotal) : 23;
    $('#jsProgressRight').textContent = (q && step >= 2) ? `Otázka ${q}/${qTotal}` : '';

    const pct = Math.max(0, Math.min(100, (step / stepTotal) * 100));
    $('#jsProgressFill').style.width = pct + '%';
    progress.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(step));
  };

  const showCard = (i) => {
    cards.forEach((c, idx) => c.classList.toggle('is-active', idx === i));
    index = i;
    window.scrollTo({ top: 0, behavior: 'instant' });
    updateProgress();
  };

  const navNext = () => {
    const card = cards[index];
    if (!validateCard(card)) return;

    // When leaving Block X (last of step 1), build dynamic options for Q2 & Q3
    if (card.matches('[data-kind="block-x"]') && index === 3) {
      buildDynamicOptions();
    }

    // last question -> done
    if (index === cards.length - 2) {
      // Build debug payload
      const payload = buildPayload();
      $('#jsDebugOut').textContent = JSON.stringify(payload, null, 2);
    }

    showCard(Math.min(index + 1, cards.length - 1));
  };

  const navBack = () => showCard(Math.max(index - 1, 0));

  // -----------------------------
  // Reveal + Reset (Appendix C)
  // -----------------------------
  const initSwitches = () => {
    $$('[data-switch]').forEach((switchWrap) => {
      const outSel = $('.ui-switch__input', switchWrap)?.getAttribute('data-switch-out');
      const out = outSel ? $(outSel) : null;

      const targetSel = switchWrap.getAttribute('data-reveal-target');
      const target = targetSel ? $(targetSel) : null;

      const input = $('.ui-switch__input', switchWrap);
      if (!input || !out) return;

      const sync = () => {
        out.value = input.checked ? 'ano' : 'nie';

        if (target) {
          if (out.value === 'ano') {
            target.classList.remove('is-hidden');
          } else {
            target.classList.add('is-hidden');
            resetContainer(target);
          }
        }
      };

      input.addEventListener('change', sync);
      sync();
    });
  };

  const initCheckboxInlineReveals = () => {
    $$('input[type="checkbox"][data-inline-target]').forEach((cb) => {
      const target = $(cb.getAttribute('data-inline-target'));
      if (!target) return;

      const sync = () => {
        if (cb.checked) {
          target.classList.remove('is-hidden');
        } else {
          target.classList.add('is-hidden');
          resetContainer(target);
          // If checkbox is social platform, also remove from x_social_urls
          if (cb.name === 'x_social_types[]') syncSocialUrls();
        }
      };

      cb.addEventListener('change', sync);
      sync();
    });
  };

  const initSectorOtherReveal = () => {
    const sector = $('#x_sector');
    const target = $('#reveal_sector_other');
    if (!sector || !target) return;

    const sync = () => {
      if (sector.value === 'Iný odbor') target.classList.remove('is-hidden');
      else {
        target.classList.add('is-hidden');
        resetContainer(target);
      }
    };

    sector.addEventListener('change', sync);
    sync();
  };

  // Social URLs JSON builder
  const syncSocialUrls = () => {
    const obj = {};
    $$('[data-social-platform]').forEach((input) => {
      const platform = input.getAttribute('data-social-platform');
      const cb = $(`input[name="x_social_types[]"][value="${CSS.escape(platform)}"]`);
      if (!cb || !cb.checked) return;
      const v = input.value.trim();
      if (v) obj[platform] = v;
    });

    // other url -> store under key 'Iné' (keeps x_social_urls object)
    const otherCb = $('input[name="x_social_types[]"][value="Iné"]');
    if (otherCb && otherCb.checked) {
      const otherUrl = $('#x_social_other_url')?.value?.trim();
      if (otherUrl) obj['Iné'] = otherUrl;
    }

    $('#x_social_urls').value = JSON.stringify(obj);
  };

  const initSocialUrlInputs = () => {
    $$('[data-social-platform]').forEach((input) => {
      input.addEventListener('input', syncSocialUrls);
      input.addEventListener('change', syncSocialUrls);
    });
    $('#x_social_other_url')?.addEventListener('input', syncSocialUrls);
    $('#x_social_other_url')?.addEventListener('change', syncSocialUrls);
    $$('input[name="x_social_types[]"]').forEach((cb) => cb.addEventListener('change', syncSocialUrls));
  };

  // Offline uploads: create hidden file inputs with canonical names x_offline_upload_<type>
  const OFFLINE_UPLOAD_KEY = {
    letaky: 'x_offline_upload_letaky',
    brozury_katalogy: 'x_offline_upload_brozury_katalogy',
    plagaty: 'x_offline_upload_plagaty',
    vizitky: 'x_offline_upload_vizitky',
    billboardy_bannery: 'x_offline_upload_billboardy_bannery',
    oznacenie_prevadzky: 'x_offline_upload_oznacenie_prevadzky',
    polep_aut: 'x_offline_upload_polep_aut',
    ine: 'x_offline_upload_ine',
  };

  const initUploads = () => {
    $$('[data-upload]').forEach((wrap) => {
      const type = wrap.getAttribute('data-upload-type');
      const input = $('[data-upload-input]', wrap);
      const meta = $('[data-filelist]', wrap);
      if (!type || !input || !meta) return;

      // Create a hidden file input with canonical name; we copy selected FileList on submit only.
      // (Browser security doesn't allow programmatic set of files; so for now we keep original input and assign name at runtime.)
      input.setAttribute('name', OFFLINE_UPLOAD_KEY[type] || '');

      input.addEventListener('change', () => {
        meta.textContent = input.files && input.files[0] ? input.files[0].name : '';
      });
    });
  };

  // Mutual exclusive checkbox rule (D11 "žiadne")
  const initMutualExclusive = () => {
    $$('input[type="checkbox"][data-mutual-exclusive="proof_none"]').forEach((noneCb) => {
      const group = noneCb.closest('[data-group="proof"]') || noneCb.closest('fieldset');
      if (!group) return;
      const others = $$('input[type="checkbox"]', group).filter((cb) => cb !== noneCb);

      noneCb.addEventListener('change', () => {
        if (!noneCb.checked) return;
        others.forEach((cb) => { cb.checked = false; });
      });

      others.forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) noneCb.checked = false;
        });
      });
    });
  };

  // -----------------------------
  // Phone formatting (UI) – store digits-only in x_phone_number (Appendix B)
  // -----------------------------
  const initPhone = () => {
    const vis = $('#ui_phone_visible');
    const hidden = $('#x_phone_number');
    if (!vis || !hidden) return;

    const format = (digits) => {
      const d = digits.replace(/\D/g, '').slice(0, 15);
      // Default Slovak formatting: groups of 3 (908 112 252)
      return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
    };

    const sync = () => {
      const digits = vis.value.replace(/\D/g, '');
      hidden.value = digits;
      vis.value = format(digits);
    };

    vis.addEventListener('input', sync);
    vis.addEventListener('change', sync);
    sync();
  };

  // -----------------------------
  // Dynamic options (A2, A3) – podľa Bloku X + Neviem
  // -----------------------------
  const makeRadioCard = (name, value, label) => {
    const lab = document.createElement('label');
    lab.className = 'ui-radio-card';
    lab.innerHTML = `<input type="radio" name="${name}" value="${escapeHtml(value)}" /><span>${escapeHtml(label)}</span>`;
    return lab;
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const buildDynamicOptions = () => {
    const leadWrap = $('#jsLeadSourceOptions');
    const materialWrap = $('#jsMainMaterialOptions');
    if (!leadWrap || !materialWrap) return;

    leadWrap.innerHTML = '';
    materialWrap.innerHTML = '';

    const leadOptions = [];
    const materialOptions = [];

    // Web
    const webUsage = $('#x_web_usage')?.value;
    if (webUsage === 'ano') {
      leadOptions.push('Web');
      materialOptions.push('Web');
    }

    // Social platforms
    const socialUsage = $('#x_social_usage')?.value;
    if (socialUsage === 'ano') {
      $$('input[name="x_social_types[]"]:checked').forEach((cb) => {
        leadOptions.push(cb.value);
        materialOptions.push(cb.value);
      });
    }

    // Offline types
    const offlineUsage = $('#x_offline_usage')?.value;
    if (offlineUsage === 'ano') {
      $$('input[name="x_offline_types[]"]:checked').forEach((cb) => {
        leadOptions.push(cb.value);
        materialOptions.push(cb.value);
      });
    }

    // Remove duplicates while keeping order
    const uniq = (arr) => arr.filter((v, i) => arr.indexOf(v) === i);

    uniq(leadOptions).forEach((opt) => leadWrap.appendChild(makeRadioCard('q_a2_lead_source', opt, opt)));
    uniq(materialOptions).forEach((opt) => materialWrap.appendChild(makeRadioCard('q_a3_main_material', opt, opt)));

    leadWrap.appendChild(makeRadioCard('q_a2_lead_source', 'Neviem', 'Neviem'));
    materialWrap.appendChild(makeRadioCard('q_a3_main_material', 'Neviem', 'Neviem'));
  };

  // -----------------------------
  // Validation (Appendix D)
  // -----------------------------
  const validateCard = (card) => {
    // intro/done have no validation
    if (!card || card.dataset.kind === 'intro' || card.dataset.kind === 'done') return true;

    let ok = true;

    // Clear previous errors for this card
    $$('.is-invalid', card).forEach((el) => clearInvalid(el));

    // Per-field validations
    $$('[data-validate]', card).forEach((field) => {
      const rule = field.getAttribute('data-validate');

      // Skip validations in hidden containers
      if (field.closest('.is-hidden')) return;

      if (rule === 'required') {
        const input = $('input, textarea, select', field);
        if (!input || !input.value.trim()) { ok = false; setInvalid(field, ERROR.required); }
      }

      if (rule === 'select_required') {
        const sel = $('select', field);
        if (!sel || !sel.value) { ok = false; setInvalid(field, ERROR.required); }
      }

      if (rule === 'max200_optional') {
        const input = $('input, textarea', field);
        if (input && input.value.length > 200) { ok = false; setInvalid(field, ERROR.required); }
      }

      if (rule === 'full_name') {
        const input = $('input', field);
        const v = normalizeSpaces(input?.value || '');
        if (!v) { ok = false; setInvalid(field, ERROR.required); }
        else if (v.split(' ').length < 2) { ok = false; setInvalid(field, ERROR.fullName); }
      }

      if (rule === 'email') {
        const input = $('input', field);
        const v = (input?.value || '').trim();
        if (!v) { ok = false; setInvalid(field, ERROR.required); }
        else if (!isValidEmail(v)) { ok = false; setInvalid(field, ERROR.email); }
      }

      if (rule === 'phone') {
        const prefix = $('#x_phone_prefix')?.value?.trim();
        const digits = $('#x_phone_number')?.value?.trim();
        if (!prefix || !digits) { ok = false; setInvalid(field, ERROR.required); }
        else if (!/^\d+$/.test(digits) || digits.length < 6) { ok = false; setInvalid(field, ERROR.phone); }
      }

      if (rule === 'toggle_required') {
        const out = $('input[type="hidden"]', field);
        if (!out) { ok = false; setInvalid(field, ERROR.chooseOne); }
        else if (out.value !== 'ano' && out.value !== 'nie') {
          ok = false; setInvalid(field, ERROR.chooseOne);
        }
      }

      if (rule === 'radio_required') {
        const fs = field.matches('fieldset') ? field : field.closest('fieldset') || field;
        const checked = $('input[type="radio"]:checked', fs);
        if (!checked) { ok = false; setInvalid(fs, ERROR.chooseOne); }
      }

      if (rule === 'scale_required') {
        const fs = field.matches('fieldset') ? field : field.closest('fieldset') || field;
        const checked = $('input[type="radio"]:checked', fs);
        if (!checked) { ok = false; setInvalid(fs, ERROR.chooseOne); }
      }

      if (rule === 'checkbox_required') {
        const fs = field.matches('fieldset') ? field : field.closest('fieldset') || field;
        const checked = $$('input[type="checkbox"]:checked', fs);
        if (!checked.length) { ok = false; setInvalid(fs, ERROR.required); }
      }

      if (rule === 'url_required_if_active') {
        // Required only when input is visible (not hidden by reveal)
        const input = $('input[type="url"]', field);
        if (!input) return;
        const v = input.value.trim();
        if (!v) { ok = false; setInvalid(field, ERROR.url); }
        else if (!isValidUrl(v)) { ok = false; setInvalid(field, ERROR.url); }
      }

      if (rule === 'textarea_required_if_active') {
        const ta = $('textarea', field);
        const v = (ta?.value || '').trim();
        if (!v) { ok = false; setInvalid(field, ERROR.required); }
        else if (v.length > 200) { ok = false; setInvalid(field, ERROR.required); }
      }
    });

    // Social URLs: if social is on + platform checked -> URL required (handled by url_required_if_active inside inline)
    // Offline uploads are optional per spec; no required validation.

    if (!ok) {
      // Focus first error (best effort)
      const first = $('.is-invalid input, .is-invalid select, .is-invalid textarea', card);
      if (first) first.focus({ preventScroll: true });
    }
    return ok;
  };

  // -----------------------------
  // Build payload (for debug only, no backend)
  // -----------------------------
  const buildPayload = () => {
    const payload = { token: $('#x_token').value || '' };

    // FormData-like extraction
    const form = $('#form2');
    const fd = new FormData(form);

    // Remove visible phone input (no name) is not in fd, ok.
    // Social URLs: JSON string -> object
    const socialUrlsStr = $('#x_social_urls')?.value || '{}';
    try { payload.x_social_urls = JSON.parse(socialUrlsStr); } catch { payload.x_social_urls = {}; }

    // Append the rest
    fd.forEach((value, key) => {
      if (key === 'x_social_urls') return; // already parsed
      if (key === 'token') return; // already set

      // Arrays: keys with [] should become arrays
      if (key.endsWith('[]')) {
        const k = key.slice(0, -2);
        if (!Array.isArray(payload[k])) payload[k] = [];
        payload[k].push(value);
        return;
      }

      // Scalars
      payload[key] = value;
    });

    // Normalize full name
    if (payload.x_first_name) payload.x_first_name = normalizeSpaces(payload.x_first_name);

    // Phone digits already stored
    return payload;
  };

  // -----------------------------
  // Init
  // -----------------------------
  const init = () => {
    // Token (UI skrátenie, celé v title)
    const token = getTokenFromUrl();
    $('#x_token').value = token;

    const tokenEl = $('#jsTokenValue');
    const display = token
      ? (token.length > 6 ? (token.slice(0, 6) + '…') : token)
      : '—';

    tokenEl.textContent = display;
    tokenEl.title = token || '';

    // Wizard nav
    $('#form2').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav]');
      if (!btn) return;
      const dir = btn.getAttribute('data-nav');
      if (dir === 'next') navNext();
      if (dir === 'back') navBack();
    });

    // Copy JSON
    $('#jsCopyJson')?.addEventListener('click', async () => {
      const txt = $('#jsDebugOut')?.textContent || '';
      try {
        await navigator.clipboard.writeText(txt);
        alert('Skopírované.');
      } catch {
        alert('Nepodarilo sa skopírovať.');
      }
    });

    initPhone();
    initSectorOtherReveal();
    initSwitches();
    initCheckboxInlineReveals();
    initSocialUrlInputs();
    initUploads();
    initMutualExclusive();

    showCard(0);
  };

  document.addEventListener('DOMContentLoaded', init);
})();
