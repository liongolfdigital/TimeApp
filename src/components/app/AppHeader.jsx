export default function AppHeader({
  activePage,
  currentUser,
  homePage,
  installPrompt,
  navPages,
  pageConfig,
  onInstall,
  onLogout,
  onNavigate,
}) {
  return (
    <header className="topbar">
      <button
        className="brand brand-button"
        type="button"
        onClick={() => onNavigate(homePage)}
        aria-label="Trang chủ Chấm công nội bộ"
      >
        <span className="brand-logo">
          <img src="/images/LionBlk.png" alt="Lion Golf" />
        </span>
        <span><strong>Chấm công</strong><small>Nội bộ</small></span>
      </button>

      <nav className="main-nav" aria-label="Điều hướng chính">
        {navPages.map((page) => {
          const Icon = pageConfig[page].icon;
          return (
            <button
              className={activePage === page ? "active" : ""}
              type="button"
              key={page}
              onClick={() => onNavigate(page)}
            >
              <Icon size={page === "employees" ? 18 : 17} /> {pageConfig[page].label}
            </button>
          );
        })}
      </nav>

      <div className="topbar-actions">
        {installPrompt && (
          <button className="install-app-button" type="button" onClick={onInstall}>
            Cài app
          </button>
        )}
        <div className="session-badge">
          <span className="privacy-dot" />
          <span>{currentUser.fullName}</span>
          <button type="button" onClick={onLogout}>Đăng xuất</button>
        </div>
      </div>
    </header>
  );
}
