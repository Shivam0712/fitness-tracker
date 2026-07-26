// modules/views/history.js
// Thin wrapper merging Wins and Log into one tab (segmented sub-view), freeing
// a nav slot for Spotlight. Neither child view's internals change — this only
// decides which one renders into the pane.
import * as accomplishmentsView from './accomplishments.js';
import * as rawLogView from './rawLog.js';

let _tab = 'wins'; // resets to 'wins' on cold start, same as other transient view-local state (e.g. home.js _showArchived)

export function render(container, state, callbacks) {
  container.innerHTML = `
    <div class="seg history-seg">
      <button type="button" class="seg-btn ${_tab === 'wins' ? 'is-active' : ''}" data-tab="wins">Wins</button>
      <button type="button" class="seg-btn ${_tab === 'log' ? 'is-active' : ''}" data-tab="log">Log</button>
    </div>
    <div class="history-pane" id="history-pane"></div>`;

  container.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    if (b.dataset.tab === _tab) return;
    _tab = b.dataset.tab;
    render(container, state, callbacks);
  });

  const pane = container.querySelector('#history-pane');
  if (_tab === 'wins') accomplishmentsView.render(pane, state, callbacks);
  else rawLogView.render(pane, state, callbacks);
}
