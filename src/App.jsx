import { logAction } from "./api/authApi";
import {
  defaultPageForUser,
  isAdmin,
} from "./auth/authorization";
import AccountPage from "./components/AccountPage";
import AttendancePage from "./components/AttendancePage";
import DiaryPage from "./components/DiaryPage";
import EmployeePage from "./components/EmployeePage";
import LoginPage from "./components/LoginPage";
import ProcessPage from "./components/ProcessPage";
import AppHeader from "./components/app/AppHeader";
import { PAGE_CONFIG } from "./components/app/pageConfig";
import { useAppData } from "./hooks/useAppData";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useAppSession } from "./hooks/useAppSession";
import { useInstallPrompt } from "./hooks/useInstallPrompt";

/** App shell chỉ ghép session, navigation, dữ liệu dùng chung và page hiện tại. */
export default function App() {
  const session = useAppSession();
  const navigation = useAppNavigation(session.currentUser, PAGE_CONFIG);
  const data = useAppData(session.currentUser);
  const pwa = useInstallPrompt();

  const handleLogin = (user) => {
    session.handleLogin(user);
    navigation.navigateAfterLogin(user);
  };

  const handleLogout = async () => {
    await session.handleLogout();
    navigation.resetNavigation();
  };

  const offlineNotice = !pwa.isOnline && (
    <div className="offline-notice" role="status">
      Bạn đang offline. Một số chức năng cần mạng để hoạt động.
    </div>
  );

  if (session.isCheckingAuth) {
    return (
      <>
        {offlineNotice}
        <main className="login-page">
          <section className="login-card">
            <div className="eyebrow">Hệ thống chấm công nội bộ</div>
            <h1>Đang kiểm tra phiên đăng nhập...</h1>
          </section>
        </main>
      </>
    );
  }

  if (!session.currentUser) {
    return (
      <>
        {offlineNotice}
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  const navPages = isAdmin(session.currentUser)
    ? ["attendance", "process", "employees", "diary", "accounts"]
    : ["employees", "diary"];

  return (
    <div className="app-shell">
      <AppHeader
        activePage={navigation.activePage}
        currentUser={session.currentUser}
        homePage={defaultPageForUser(session.currentUser)}
        installPrompt={pwa.installPrompt}
        navPages={navPages}
        pageConfig={PAGE_CONFIG}
        onInstall={pwa.installApp}
        onLogout={handleLogout}
        onNavigate={navigation.openPage}
      />

      {offlineNotice}

      {navigation.accessDenied && (
        <main className="access-denied">
          <div className="alert alert-error" role="alert">
            <span className="privacy-dot" />
            <div>
              <strong>Không có quyền</strong>
              <span>{navigation.accessDenied}</span>
            </div>
          </div>
        </main>
      )}

      {navigation.activePage === "attendance" && isAdmin(session.currentUser) && (
        <AttendancePage
          employees={data.employees}
          diaryEntries={data.diaryEntriesWithAttachments}
          shiftRules={data.shiftRules}
          onOpenEmployees={() => navigation.openPage("employees")}
          onOpenDiary={() => navigation.openPage("diary")}
        />
      )}
      {navigation.activePage === "process" && isAdmin(session.currentUser) && (
        <ProcessPage
          employees={data.employees}
          diaryEntries={data.diaryEntriesWithAttachments}
          shiftRules={data.shiftRules}
        />
      )}
      {navigation.activePage === "employees" && (
        <EmployeePage
          currentUser={session.currentUser}
          employees={data.employees}
          onEmployeesChange={data.handleEmployeesChange}
          onLogAction={logAction}
        />
      )}
      {navigation.activePage === "diary" && (
        <DiaryPage
          currentUser={session.currentUser}
          employees={data.employees}
          entries={data.diaryEntries}
          attachments={data.attachments}
          attachmentConfig={data.attachmentConfig}
          attachmentError={data.attachmentError}
          onEntriesChange={data.handleDiaryEntriesChange}
          onAttachmentsChange={data.setAttachments}
          onLogAction={logAction}
        />
      )}
      {navigation.activePage === "accounts" && isAdmin(session.currentUser) && (
        <AccountPage currentUser={session.currentUser} />
      )}

      <footer>
        <span>Chấm Công LionGolf by ND</span>
        <span>© 2026 All Rights Reserved</span>
      </footer>
    </div>
  );
}
