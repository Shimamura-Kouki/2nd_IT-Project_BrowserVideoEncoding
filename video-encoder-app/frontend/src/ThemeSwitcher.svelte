<script lang="ts">
  import { currentTheme, themes, applyTheme } from './lib/theme';

  let showThemeMenu = false;

  function toggleThemeMenu() {
    showThemeMenu = !showThemeMenu;
  }

  function selectTheme(themeName: string) {
    applyTheme(themeName);
    showThemeMenu = false;
  }

  // Close menu when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.theme-switcher')) {
      showThemeMenu = false;
    }
  }
  
  // Get display label for current theme
  function getThemeLabel(themeName: string): string {
    if (themeName === 'auto') {
      return '自動 (システム)';
    }
    return themes[themeName]?.label || 'テーマ';
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="theme-switcher">
  <button class="theme-button" on:click|stopPropagation={toggleThemeMenu} title="テーマ変更">
    🎨 {getThemeLabel($currentTheme)}
  </button>
  
  {#if showThemeMenu}
    <div class="theme-menu">
      <button
        class="theme-option"
        class:active={$currentTheme === 'auto'}
        on:click|stopPropagation={() => selectTheme('auto')}
      >
        自動 (システム)
        {#if $currentTheme === 'auto'}
          <span class="checkmark">✓</span>
        {/if}
      </button>
      {#each Object.entries(themes) as [key, theme]}
        <button
          class="theme-option"
          class:active={$currentTheme === key}
          on:click|stopPropagation={() => selectTheme(key)}
        >
          {theme.label}
          {#if $currentTheme === key}
            <span class="checkmark">✓</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .theme-switcher {
    position: relative;
    display: inline-block;
  }

  .theme-button {
    padding: 8px 16px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
  }

  .theme-button:hover {
    background: var(--color-background);
    border-color: var(--color-primary);
  }

  .theme-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 150px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    overflow: hidden;
  }

  .theme-option {
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.2s;
  }

  .theme-option:hover {
    background: var(--color-background);
  }

  .theme-option.active {
    background: var(--color-progressBg);
    color: var(--color-primary);
    font-weight: 500;
  }

  .checkmark {
    color: var(--color-primary);
    font-weight: bold;
  }
</style>
