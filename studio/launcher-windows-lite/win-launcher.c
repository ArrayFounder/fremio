#include <windows.h>
#include <shellapi.h>

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR pCmdLine, int nCmdShow) {
  (void)hInstance;
  (void)hPrevInstance;
  (void)pCmdLine;
  (void)nCmdShow;

  const wchar_t *htaArg = L"\"https://studio.fremio.id/downloads/fremio-studio-windows-launcher.hta?v=20260425-1600\"";

  HINSTANCE result = ShellExecuteW(NULL, L"open", L"mshta.exe", htaArg, NULL, SW_SHOWNORMAL);
  if ((INT_PTR)result <= 32) {
    MessageBoxW(
      NULL,
      L"Gagal membuka launcher. Pastikan Windows Script Host aktif lalu coba lagi.",
      L"Fremio Studio Launcher",
      MB_OK | MB_ICONERROR
    );
    return 1;
  }

  return 0;
}
