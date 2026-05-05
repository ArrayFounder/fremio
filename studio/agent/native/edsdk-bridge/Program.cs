using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace CanonEdsdkBridge;

internal static class Program
{
    [System.STAThread]
    private static int Main(string[] args)
    {
        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            Console.Error.WriteLine($"[bridge] FATAL: {e.ExceptionObject}");
            Console.Error.Flush();
            Environment.Exit(99);
        };

        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: edsdk-bridge-native <status|preview|capture>");
            return 1;
        }

        var result = args[0].ToLowerInvariant() switch
        {
            "status"         => Status(args),
            "preview"        => Preview(args),
            "preview-stream" => PreviewStream(args),
            "capture"        => Capture(args),
            _ => Fail($"Unknown command: {args[0]}")
        };

        Console.Error.Flush();
        return result;
    }

    private static int Status(string[] args)
    {
        var json = args.Any(a => a.Equals("--json", StringComparison.OrdinalIgnoreCase));
        try
        {
            using var sdk = new EdsdkSession();
            var cameras = sdk.ListCameras();

            var payload = new
            {
                ok = true,
                backend = "edsdk",
                cameras = cameras.Select(c => new { model = c.Model, port = c.Port }).ToArray(),
                capabilities = new { supportsCapture = true, supportsLiveView = cameras.Count > 0, mode = cameras.Count > 0 ? "live-view" : "capture-only" },
                error = cameras.Count == 0 ? "Canon EDSDK aktif, kamera belum terdeteksi (cek mode kamera / pastikan model didukung EDSDK)" : (string?)null
            };

            if (json)
            {
                Console.Out.Write(JsonSerializer.Serialize(payload));
            }
            else
            {
                Console.Out.WriteLine(JsonSerializer.Serialize(payload));
            }

            return 0;
        }
        catch (Exception ex)
        {
            return PrintBridgeError(ex);
        }
    }

    private static int Preview(string[] args)
    {
        var toStdout = args.Any(a => a.Equals("--stdout", StringComparison.OrdinalIgnoreCase));
        if (!toStdout)
        {
            return Fail("preview command requires --stdout");
        }

        try
        {
            using var sdk = new EdsdkSession();
            var frame = sdk.GetLiveViewJpeg();
            if (frame is null || frame.Length == 0)
            {
                return PrintLiveViewNotSupported("Live view kosong atau kamera tidak dalam mode Live View");
            }

            using var output = Console.OpenStandardOutput();
            output.Write(frame, 0, frame.Length);
            return 0;
        }
        catch (Exception ex)
        {
            return PrintLiveViewNotSupported(ex.Message);
        }
    }

    private static int PreviewStream(string[] _)
    {
        try
        {
            using var sdk = new EdsdkSession();
            sdk.StartLiveViewStream();
            return 0;
        }
        catch (Exception ex)
        {
            return PrintLiveViewNotSupported(ex.Message);
        }
    }

    private static int PrintLiveViewNotSupported(string reason)
    {
        var payload = new
        {
            ok = false,
            backend = "edsdk",
            supportsLiveView = false,
            error = reason,
            hint = "Tekan tombol Live View di kamera atau aktifkan mode Live View sebelum membuka booth"
        };
        Console.Error.WriteLine(JsonSerializer.Serialize(payload));
        return 2;
    }

    private static int Capture(string[] args)
    {
        var outputPath = GetArgValue(args, "--output");
        if (string.IsNullOrWhiteSpace(outputPath))
        {
            return Fail("capture command requires --output <path>");
        }

        try
        {
            using var sdk = new EdsdkSession();
            sdk.CaptureToFile(outputPath!);
            return 0;
        }
        catch (Exception ex)
        {
            return PrintBridgeError(ex);
        }
    }

    private static string? GetArgValue(string[] args, string flag)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals(flag, StringComparison.OrdinalIgnoreCase)) return args[i + 1];
        }

        return null;
    }

    private static int PrintBridgeError(Exception ex)
    {
        var payload = new
        {
            ok = false,
            backend = "edsdk",
            error = ex.Message
        };

        Console.Error.WriteLine(JsonSerializer.Serialize(payload));
        return 1;
    }

    private static int Fail(string message)
    {
        Console.Error.WriteLine(message);
        return 1;
    }
}

internal sealed class EdsdkSession : IDisposable
{
    private const uint PropID_Evf_OutputDevice = 0x00000500;
    private const uint EvfOutputDevice_PC = 0x00000002;
    private const uint PropID_ProductName = 0x00000002;
    private const uint PropID_SaveTo = 0x0000000B;
    private const uint SaveTo_Host = 2;
    private const uint EdsErr_DeviceBusy = 0x00000081;
    private const uint EdsErr_TakePictureNg = 0x00008D07;
    private const uint CameraCommand_TakePicture = 0;

    private IntPtr _cameraRef = IntPtr.Zero;
    private bool _disposed;
    private static readonly Edsdk.EdsCameraAddedHandler CameraAddedHandler = static _ => 0;
    private Edsdk.EdsObjectEventHandler? _captureObjectHandler;

    private static void PrepareEdsdkDllDirectory()
    {
        var explicitDll = Environment.GetEnvironmentVariable("EDSDK_DLL_PATH");
        if (!string.IsNullOrWhiteSpace(explicitDll) && File.Exists(explicitDll))
        {
            var dir = Path.GetDirectoryName(explicitDll);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                NativeMethods.SetDllDirectory(dir);
                return;
            }
        }

        var exeDir = AppContext.BaseDirectory;
        if (File.Exists(Path.Combine(exeDir, "EDSDK.dll")))
        {
            NativeMethods.SetDllDirectory(exeDir);
        }
    }

    public EdsdkSession()
    {
        PrepareEdsdkDllDirectory();
        Check(Edsdk.EdsInitializeSDK(), "Gagal inisialisasi EDSDK");

        var hookResult = Edsdk.EdsSetCameraAddedHandler(CameraAddedHandler, IntPtr.Zero);
        if (hookResult != 0)
        {
            Console.Error.WriteLine($"[edsdk] camera-added handler warning (0x{hookResult:X8})");
        }

        PumpSdkEvents(8, 120);
    }

    public IReadOnlyList<CameraInfo> ListCameras()
    {
        for (var attempt = 0; attempt < 6; attempt++)
        {
            PumpSdkEvents(4, 120);

            var listRef = IntPtr.Zero;
            var result = new List<CameraInfo>();

            Check(Edsdk.EdsGetCameraList(out listRef), "Gagal baca daftar kamera");
            try
            {
                Check(Edsdk.EdsGetChildCount(listRef, out var count), "Gagal baca jumlah kamera");
                Console.Error.WriteLine($"[edsdk-diag] attempt={attempt} camera_count={count}");
                for (var i = 0; i < count; i++)
                {
                    Check(Edsdk.EdsGetChildAtIndex(listRef, i, out var camRef), "Gagal akses kamera");
                    try
                    {
                        var model = ReadCameraModel(camRef);
                        result.Add(new CameraInfo(model, $"edsdk:{i}"));
                    }
                    finally
                    {
                        if (camRef != IntPtr.Zero) Edsdk.EdsRelease(camRef);
                    }
                }

                if (result.Count > 0 || attempt == 5)
                {
                    return result;
                }
            }
            finally
            {
                if (listRef != IntPtr.Zero) Edsdk.EdsRelease(listRef);
            }

            Thread.Sleep(500);
        }

        return Array.Empty<CameraInfo>();
    }

    private static void PumpSdkEvents(int rounds, int delayMs)
    {
        for (var i = 0; i < rounds; i++)
        {
            Edsdk.EdsGetEvent();
            NativeMethods.PumpWindowsMessages();
            Thread.Sleep(delayMs);
        }
    }

    public void StartLiveViewStream()
    {
        EnsureCameraReady();
        TryEnableEvf();
        PumpSdkEvents(8, 200);

        using var stdout = Console.OpenStandardOutput();
        var consecutiveFails = 0;

        while (true)
        {
            Edsdk.EdsGetEvent();
            NativeMethods.PumpWindowsMessages();

            var streamRef   = IntPtr.Zero;
            var evfImageRef = IntPtr.Zero;
            try
            {
                if (Edsdk.EdsCreateMemoryStream(0, out streamRef) != 0)
                    { consecutiveFails++; Thread.Sleep(80); continue; }

                if (Edsdk.EdsCreateEvfImageRef(streamRef, out evfImageRef) != 0)
                    { consecutiveFails++; Thread.Sleep(80); continue; }

                var dlErr = Edsdk.EdsDownloadEvfImage(_cameraRef, evfImageRef);
                if (dlErr != 0)
                {
                    consecutiveFails++;
                    if (consecutiveFails > 40)
                        throw new InvalidOperationException($"EVF gagal berturut-turut (0x{dlErr:X8})");
                    Thread.Sleep(200);
                    continue;
                }

                if (Edsdk.EdsGetPointer(streamRef, out var ptr) == 0 &&
                    Edsdk.EdsGetLength(streamRef, out var len)  == 0 &&
                    ptr != IntPtr.Zero && len > 0 && len <= 10 * 1024 * 1024)
                {
                    var frame = new byte[len];
                    Marshal.Copy(ptr, frame, 0, (int)len);

                    var header = new byte[4];
                    header[0] = (byte)(len >> 24);
                    header[1] = (byte)(len >> 16);
                    header[2] = (byte)(len >> 8);
                    header[3] = (byte)(len & 0xFF);

                    stdout.Write(header, 0, 4);
                    stdout.Write(frame,  0, (int)len);
                    stdout.Flush();
                    consecutiveFails = 0;
                }
            }
            finally
            {
                if (evfImageRef != IntPtr.Zero) Edsdk.EdsRelease(evfImageRef);
                if (streamRef   != IntPtr.Zero) Edsdk.EdsRelease(streamRef);
            }

            Thread.Sleep(80);
        }
    }

    public byte[] GetLiveViewJpeg()
    {
        EnsureCameraReady();
        TryEnableEvf();
        PumpSdkEvents(6, 200);

        var streamRef = IntPtr.Zero;
        var evfImageRef = IntPtr.Zero;

        try
        {
            Check(Edsdk.EdsCreateMemoryStream(0, out streamRef), "Gagal membuat stream EVF");
            Check(Edsdk.EdsCreateEvfImageRef(streamRef, out evfImageRef), "Gagal membuat image ref EVF");
            Check(Edsdk.EdsDownloadEvfImage(_cameraRef, evfImageRef), "Gagal download live view Canon");

            Check(Edsdk.EdsGetPointer(streamRef, out var ptr), "Gagal akses buffer EVF");
            Check(Edsdk.EdsGetLength(streamRef, out var len), "Gagal akses ukuran EVF");

            if (ptr == IntPtr.Zero || len <= 0 || len > int.MaxValue) return Array.Empty<byte>();

            var bytes = new byte[len];
            Marshal.Copy(ptr, bytes, 0, (int)len);
            return bytes;
        }
        finally
        {
            if (evfImageRef != IntPtr.Zero) Edsdk.EdsRelease(evfImageRef);
            if (streamRef != IntPtr.Zero) Edsdk.EdsRelease(streamRef);
        }
    }

    public void CaptureToFile(string outputPath)
    {
        EnsureCameraReady();
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
        Console.Error.WriteLine("[bridge] Capture: session ready, registering object event handler");
        var captureStartedAtUtc = DateTime.UtcNow;
        var staleCutoffUtc = captureStartedAtUtc.AddSeconds(-2);

        var downloadDone = new ManualResetEventSlim(false);
        var capturedData = Array.Empty<byte>();
        var capturedError = (Exception?)null;

        _captureObjectHandler = (evt, objRef, context) =>
        {
            var shouldSignal = false;
            try
            {
                var evtId = (uint)evt;
                Console.Error.WriteLine($"[bridge] ObjectEvent 0x{evtId:X8} received");

                // EOS 1100D sends DirItemCreated instead of DirItemRequestTransfer
                if (evtId != Edsdk.ObjectEvent_DirItemRequestTransfer && evtId != Edsdk.ObjectEvent_DirItemCreated)
                {
                    if (objRef != IntPtr.Zero) Edsdk.EdsRelease(objRef);
                    return 0;
                }

                if (objRef == IntPtr.Zero)
                {
                    capturedError = new InvalidOperationException("Handle foto Canon kosong");
                    shouldSignal = true;
                    return 0;
                }

                Check(Edsdk.EdsGetDirectoryItemInfo(objRef, out var itemInfo), "Gagal baca info file Canon");
                Console.Error.WriteLine($"[bridge] DirItem: {itemInfo.FileName} size={itemInfo.Size}");

                Check(Edsdk.EdsCreateMemoryStream(0, out var streamRef), "Gagal buat stream download");
                try
                {
                    Check(Edsdk.EdsDownload(objRef, itemInfo.Size, streamRef), "Gagal download hasil capture Canon");
                    Console.Error.WriteLine("[bridge] EdsDownload succeeded");

                    // Only call DownloadComplete for PC-requested transfers (internal memory clear)
                    if (evtId == Edsdk.ObjectEvent_DirItemRequestTransfer)
                    {
                        Check(Edsdk.EdsDownloadComplete(objRef), "Gagal finalize download capture Canon");
                        Console.Error.WriteLine("[bridge] EdsDownloadComplete succeeded");
                    }

                    Check(Edsdk.EdsGetPointer(streamRef, out var ptr), "Gagal baca pointer stream capture");
                    Check(Edsdk.EdsGetLength(streamRef, out var len), "Gagal baca ukuran stream capture");

                    if (ptr == IntPtr.Zero || len <= 0 || len > int.MaxValue)
                    {
                        capturedError = new InvalidOperationException("Data capture Canon kosong");
                        shouldSignal = true;
                        return 0;
                    }

                    capturedData = new byte[len];
                    Marshal.Copy(ptr, capturedData, 0, (int)len);
                    Console.Error.WriteLine($"[bridge] Captured {capturedData.Length} bytes");
                    if (!IsLikelyJpeg(capturedData))
                    {
                        Console.Error.WriteLine("[bridge] Captured transfer is non-JPEG, waiting for next transfer...");
                        capturedData = Array.Empty<byte>();
                        return 0;
                    }

                    var capturedAtUtc = TryParseCameraDateTime(itemInfo.DateTime);
                    if (capturedAtUtc.HasValue && capturedAtUtc.Value < staleCutoffUtc)
                    {
                        Console.Error.WriteLine($"[bridge] Ignoring stale JPEG transfer (cameraTime={capturedAtUtc.Value:O}, cutoff={staleCutoffUtc:O})");
                        capturedData = Array.Empty<byte>();
                        return 0;
                    }

                    shouldSignal = true;
                }
                finally
                {
                    if (streamRef != IntPtr.Zero) Edsdk.EdsRelease(streamRef);
                    Edsdk.EdsRelease(objRef);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[bridge] Event handler error: {ex.Message}");
                capturedError = ex;
                shouldSignal = true;
                if (objRef != IntPtr.Zero) Edsdk.EdsRelease(objRef);
            }
            finally
            {
                if (shouldSignal) downloadDone.Set();
            }

            return 0;
        };

        // Configure camera to save to PC so we receive download events
        var saveTo = SaveTo_Host;
        Edsdk.EdsSetPropertyData(_cameraRef, PropID_SaveTo, 0, Marshal.SizeOf<uint>(), ref saveTo);
        Console.Error.WriteLine("[bridge] SaveTo set to Host");

        var capacity = new Edsdk.EdsCapacity
        {
            NumberOfFreeClusters = int.MaxValue,
            BytesPerSector = 0x1000,
            Reset = 1,
        };
        var capacityErr = Edsdk.EdsSetCapacity(_cameraRef, capacity);
        if (capacityErr == 0)
        {
            Console.Error.WriteLine("[bridge] Host capacity set");
        }
        else
        {
            Console.Error.WriteLine($"[bridge] Host capacity warning (0x{capacityErr:X8})");
        }

        Check(Edsdk.EdsSetObjectEventHandler(_cameraRef, Edsdk.ObjectEvent_All, _captureObjectHandler, IntPtr.Zero), "Gagal pasang event capture Canon");
        Console.Error.WriteLine("[bridge] Event handler registered, sending TakePicture command");

        try
        {
            SendTakePictureWithRetry();
            Console.Error.WriteLine("[bridge] TakePicture command sent, waiting for download event...");
            var deadline = DateTime.UtcNow.AddSeconds(30);
            while (!downloadDone.IsSet && DateTime.UtcNow < deadline)
            {
                Edsdk.EdsGetEvent();
                NativeMethods.PumpWindowsMessages();
                downloadDone.Wait(50);
            }
            if (!downloadDone.IsSet)
                throw new TimeoutException("Timeout menunggu hasil capture Canon");

            if (capturedError is not null) throw capturedError;
            if (capturedData.Length == 0) throw new InvalidOperationException("Data capture Canon kosong");

            File.WriteAllBytes(outputPath, capturedData);
            Console.Error.WriteLine($"[bridge] Written {capturedData.Length} bytes to {outputPath}");
        }
        finally
        {
            Edsdk.EdsSetObjectEventHandler(_cameraRef, Edsdk.ObjectEvent_All, null, IntPtr.Zero);
            _captureObjectHandler = null;
            Console.Error.WriteLine("[bridge] Event handler unregistered");
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        if (_cameraRef != IntPtr.Zero)
        {
            Edsdk.EdsCloseSession(_cameraRef);
            Edsdk.EdsRelease(_cameraRef);
            _cameraRef = IntPtr.Zero;
        }

        Edsdk.EdsTerminateSDK();
    }

    private static string ReadCameraModel(IntPtr cameraRef)
    {
        var err = Edsdk.EdsGetDeviceInfo(cameraRef, out var info);
        if (err == 0 && !string.IsNullOrWhiteSpace(info.szDeviceDescription))
        {
            return info.szDeviceDescription.TrimEnd('\0', ' ');
        }
        return "Canon Camera";
    }

    private static void Check(uint err, string message)
    {
        if (err != 0)
        {
            throw new InvalidOperationException($"{message} (0x{err:X8})");
        }
    }

    private static IntPtr GetFirstCamera()
    {
        var cameraListRef = IntPtr.Zero;
        Check(Edsdk.EdsGetCameraList(out cameraListRef), "Gagal inisialisasi daftar kamera");

        try
        {
            Check(Edsdk.EdsGetChildCount(cameraListRef, out var count), "Gagal baca jumlah kamera Canon");
            if (count <= 0) return IntPtr.Zero;

            Check(Edsdk.EdsGetChildAtIndex(cameraListRef, 0, out var cameraRef), "Gagal ambil kamera Canon pertama");
            return cameraRef;
        }
        finally
        {
            if (cameraListRef != IntPtr.Zero) Edsdk.EdsRelease(cameraListRef);
        }
    }

    private void EnsureCameraReady()
    {
        if (_cameraRef != IntPtr.Zero) return;

        _cameraRef = GetFirstCameraWithRetry();
        if (_cameraRef == IntPtr.Zero)
        {
            throw new InvalidOperationException("Kamera Canon belum terdeteksi oleh EDSDK");
        }

        Check(Edsdk.EdsOpenSession(_cameraRef), "Gagal membuka sesi kamera Canon");
    }

    private static IntPtr GetFirstCameraWithRetry()
    {
        for (var attempt = 0; attempt < 6; attempt++)
        {
            var cameraRef = GetFirstCamera();
            if (cameraRef != IntPtr.Zero) return cameraRef;
            Thread.Sleep(500);
        }

        return IntPtr.Zero;
    }

    private void TryEnableEvf()
    {
        if (_cameraRef == IntPtr.Zero) return;

        var evfDevice = EvfOutputDevice_PC;
        Edsdk.EdsSetPropertyData(_cameraRef, PropID_Evf_OutputDevice, 0, Marshal.SizeOf<uint>(), ref evfDevice);
    }

    private static bool IsRetryableShutterError(uint err)
    {
        return err == EdsErr_DeviceBusy || err == EdsErr_TakePictureNg;
    }

    private static bool IsLikelyJpeg(byte[] bytes)
    {
        return bytes.Length >= 3
            && bytes[0] == 0xFF
            && bytes[1] == 0xD8
            && bytes[2] == 0xFF;
    }

    private static DateTime? TryParseCameraDateTime(uint value)
    {
        if (value == 0) return null;
        try
        {
            return DateTimeOffset.FromUnixTimeSeconds(value).UtcDateTime;
        }
        catch
        {
            return null;
        }
    }

    private void SendTakePictureWithRetry()
    {
        uint lastErr = 0;
        for (var attempt = 1; attempt <= 8; attempt++)
        {
            var err = Edsdk.EdsSendCommand(_cameraRef, CameraCommand_TakePicture, 0);
            if (err == 0) return;

            lastErr = err;
            if (!IsRetryableShutterError(err))
            {
                Check(err, "Gagal trigger shutter Canon");
            }

            Console.Error.WriteLine($"[bridge] TakePicture retry {attempt}/8 after error 0x{err:X8}");
            PumpSdkEvents(4, 120);
            NativeMethods.PumpWindowsMessages();
            Thread.Sleep(220);
        }

        Check(lastErr, "Gagal trigger shutter Canon");
    }
}

internal readonly record struct CameraInfo(string Model, string Port);

internal static class Edsdk
{
    public const uint ObjectEvent_All = 0x00000200;
    public const uint ObjectEvent_DirItemCreated = 0x00000202;
    public const uint ObjectEvent_DirItemRequestTransfer = 0x00000208;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct EdsDeviceInfo
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string szPortName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string szDeviceDescription;

        public uint deviceSubType;
        public uint reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct EdsDirectoryItemInfo
    {
        public uint Size;
        public int IsFolder;
        public uint GroupID;
        public uint Option;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string FileName;

        public uint Format;
        public uint DateTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct EdsCapacity
    {
        public int NumberOfFreeClusters;
        public int BytesPerSector;
        public int Reset;
    }

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate uint EdsObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate uint EdsCameraAddedHandler(IntPtr inContext);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsInitializeSDK();

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsTerminateSDK();

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetEvent();

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetCameraAddedHandler(EdsCameraAddedHandler? inCameraAddedHandler, IntPtr inContext);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetDeviceInfo(IntPtr inCameraRef, out EdsDeviceInfo outDeviceInfo);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetCameraList(out IntPtr outCameraListRef);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetChildAtIndex(IntPtr inRef, int inIndex, out IntPtr outRef);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsOpenSession(IntPtr inCameraRef);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsCloseSession(IntPtr inCameraRef);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inSize, ref uint inPropertyData);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetPropertyData(IntPtr inRef, uint inPropertyID, int inParam, int inPropertySize, [Out] byte[] outPropertyData);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsCreateMemoryStream(uint inBufferSize, out IntPtr outStream);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsCreateEvfImageRef(IntPtr inStreamRef, out IntPtr outEvfImageRef);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsDownloadEvfImage(IntPtr inCameraRef, IntPtr outEvfImageRef);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetPointer(IntPtr inStreamRef, out IntPtr outPointer);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetLength(IntPtr inStreamRef, out ulong outLength);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetObjectEventHandler(IntPtr inCameraRef, uint inEvent, EdsObjectEventHandler? inObjectEventHandler, IntPtr inContext);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetCapacity(IntPtr inCameraRef, EdsCapacity inCapacity);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetDirectoryItemInfo(IntPtr inDirItemRef, out EdsDirectoryItemInfo outDirItemInfo);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsDownload(IntPtr inDirItemRef, uint inReadSize, IntPtr outStream);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsDownloadComplete(IntPtr inDirItemRef);

    [DllImport("EDSDK.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsRelease(IntPtr inRef);
}

internal static class NativeMethods
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool SetDllDirectory(string lpPathName);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int x;
        public int y;
    }

    private const uint PM_REMOVE = 0x0001;

    [DllImport("user32.dll")]
    private static extern bool PeekMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    public static void PumpWindowsMessages()
    {
        while (PeekMessage(out var msg, IntPtr.Zero, 0, 0, PM_REMOVE))
        {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }
}
