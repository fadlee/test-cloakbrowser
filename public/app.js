const form = document.getElementById('search-form');
const queryInput = document.getElementById('query');
const pagesSelect = document.getElementById('pages');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  const pages = parseInt(pagesSelect.value, 10) || 1;

  setBusy(true);
  showStatus('Searching... this may take a few seconds.', 'info');
  resultsEl.innerHTML = '';

  try {
    const res = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, pages }),
    });
    const data = await res.json();

    if (!res.ok) {
      showStatus(`Error: ${data.error || 'Unknown error'} (${data.code || res.status})`, 'error');
      return;
    }

    renderResults(data);
    const total = data.results.organic.length;
    showStatus(`Found ${total} organic result${total === 1 ? '' : 's'} for "${data.query}".`, 'success');
  } catch (err) {
    showStatus(`Network error: ${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
});

function setBusy(busy) {
  submitBtn.disabled = busy;
  queryInput.disabled = busy;
  pagesSelect.disabled = busy;
  submitBtn.textContent = busy ? 'Searching...' : 'Search';
}

function showStatus(text, kind = 'info') {
  statusEl.textContent = text;
  statusEl.className = `status status-${kind}`;
  statusEl.classList.remove('hidden');
}

function renderResults(data) {
  const { results } = data;
  const frag = document.createDocumentFragment();

  if (results.featuredSnippet && (results.featuredSnippet.title || results.featuredSnippet.snippet)) {
    frag.appendChild(renderFeaturedSnippet(results.featuredSnippet));
  }

  if (results.organic.length) {
    frag.appendChild(renderSection('Organic results', renderOrganicList(results.organic)));
  } else {
    frag.appendChild(renderEmpty('No organic results parsed. Google layout may have changed.'));
  }

  if (results.peopleAlsoAsk.length) {
    frag.appendChild(renderSection('People also ask', renderTextList(results.peopleAlsoAsk)));
  }

  if (results.relatedSearches.length) {
    frag.appendChild(renderSection('Related searches', renderChipList(results.relatedSearches)));
  }

  resultsEl.appendChild(frag);
}

function renderFeaturedSnippet(fs) {
  const card = document.createElement('article');
  card.className = 'card featured';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = 'Featured snippet';
  card.appendChild(label);

  if (fs.title) {
    const h = document.createElement('h3');
    h.textContent = fs.title;
    card.appendChild(h);
  }
  if (fs.snippet) {
    const p = document.createElement('p');
    p.textContent = fs.snippet;
    card.appendChild(p);
  }
  if (fs.url) {
    const a = document.createElement('a');
    a.href = fs.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = fs.url;
    a.className = 'url';
    card.appendChild(a);
  }
  return card;
}

function renderOrganicList(items) {
  const list = document.createElement('div');
  list.className = 'organic-list';
  items.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'card organic';

    const number = document.createElement('span');
    number.className = 'rank';
    number.textContent = `#${idx + 1}`;
    card.appendChild(number);

    const titleLink = document.createElement('a');
    titleLink.href = item.url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.className = 'title';
    titleLink.textContent = item.title;
    card.appendChild(titleLink);

    if (item.displayedUrl) {
      const cite = document.createElement('div');
      cite.className = 'cite';
      cite.textContent = item.displayedUrl;
      card.appendChild(cite);
    } else {
      const cite = document.createElement('div');
      cite.className = 'cite';
      cite.textContent = item.url;
      card.appendChild(cite);
    }

    if (item.snippet) {
      const p = document.createElement('p');
      p.className = 'snippet';
      p.textContent = item.snippet;
      card.appendChild(p);
    }

    list.appendChild(card);
  });
  return list;
}

function renderTextList(items) {
  const ul = document.createElement('ul');
  ul.className = 'text-list';
  items.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  });
  return ul;
}

function renderChipList(items) {
  const wrap = document.createElement('div');
  wrap.className = 'chip-list';
  items.forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = t;
    chip.addEventListener('click', () => {
      queryInput.value = t;
      form.dispatchEvent(new Event('submit'));
    });
    wrap.appendChild(chip);
  });
  return wrap;
}

function renderSection(title, contentEl) {
  const section = document.createElement('section');
  section.className = 'section';
  const h = document.createElement('h2');
  h.textContent = title;
  section.appendChild(h);
  section.appendChild(contentEl);
  return section;
}

function renderEmpty(message) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = message;
  return div;
}
