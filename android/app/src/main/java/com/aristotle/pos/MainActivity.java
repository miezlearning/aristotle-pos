package com.aristotle.pos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.BluetoothClass;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.DhcpInfo;
import android.net.wifi.WifiManager;
import java.net.InetSocketAddress;
import android.os.Build;
import android.os.Bundle;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.util.Collections;
import android.util.Base64;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "AristotlePOS";
    private static final int PERMISSION_REQUEST_CODE = 101;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1002;
    private static final int UNKNOWN_SOURCES_PERMISSION_REQUEST_CODE = 1003;
    private boolean pendingInstallAfterPermission = false;

    private static final String PRODUCTION_URL = "https://miezlearning.github.io/aristotle-pos/";
    private static final String OFFLINE_FALLBACK_URL = "file:///android_asset/index.html";
    private static final String DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1547145982947491941/tJFIxfrErcDXb1_N3Hd3BlIznMTX33DB-O6WhjxNILb0JinDVwpmdxPh6dt4Uk0HJgZg";

    // Standard Serial Port Profile (SPP) UUID for Classic Bluetooth Thermal Printers
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String PRINTER_PREFS_NAME = "AristotlePrinterPrefs";
    private static final String KEY_PREF_PRINTER_MAC = "preferred_printer_mac";

    private WebView webView;
    private BluetoothAdapter bluetoothAdapter;
    private String preferredPrinterAddress = null;
    private String lastPrintErrorMessage = "";

    // Persistent Bluetooth Socket & Output Stream for Instant Zero-Delay Printing
    private BluetoothSocket activeSocket = null;
    private OutputStream activeOutputStream = null;
    private String connectedDeviceAddress = null;
    private final Object socketLock = new Object();
    private final ExecutorService printExecutor = Executors.newSingleThreadExecutor();

    // Callback untuk pemilih file/gambar (HTML <input type="file">)
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupCrashTelemetry();

        webView = new WebView(this);
        setContentView(webView);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // Pastikan layar mesin kasir tetap menyala (tidak sleep/doze) saat bertugas
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        try {
            SharedPreferences prefs = getSharedPreferences(PRINTER_PREFS_NAME, MODE_PRIVATE);
            preferredPrinterAddress = prefs.getString(KEY_PREF_PRINTER_MAC, null);
            if (preferredPrinterAddress != null) {
                Log.d(TAG, "Memuat preferensi printer Bluetooth tersimpan: " + preferredPrinterAddress);
            }
        } catch (Exception ignored) {}

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Cache-First with ServiceWorker support
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    return handleExternalUrl(request.getUrl().toString());
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(url);
            }

            private boolean handleExternalUrl(String url) {
                if (url == null) return false;

                // 1. Biarkan WebView menangani halaman aplikasi sendiri (URL Cloud & Offline Fallback)
                if (url.startsWith("https://miezlearning.github.io/aristotle-pos") || 
                    url.startsWith("file:///android_asset/")) {
                    return false;
                }

                // 2. WhatsApp: arahkan langsung ke aplikasi WhatsApp native resmi
                if (url.startsWith("https://wa.me/") || 
                    url.startsWith("https://api.whatsapp.com/") || 
                    url.startsWith("whatsapp://")) {
                    try {
                        Intent waIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        waIntent.setPackage("com.whatsapp");
                        waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(waIntent);
                        return true;
                    } catch (Exception e) {
                        try {
                            Intent genericIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            genericIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(genericIntent);
                            return true;
                        } catch (Exception err) {
                            Log.e(TAG, "Gagal membuka WhatsApp: " + url, err);
                        }
                    }
                    return true;
                }

                // 3. Telepon, SMS, Email, Peta
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("sms:") || url.startsWith("geo:")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        Log.e(TAG, "Gagal membuka link aksi: " + url, e);
                    }
                    return true;
                }

                // 4. Custom Intent Android (intent:... atau intent://...)
                if (url.startsWith("intent:")) {
                    try {
                        Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        PackageManager pm = getPackageManager();
                        if (pm != null && intent.resolveActivity(pm) != null) {
                            startActivity(intent);
                        } else {
                            String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                            if (fallbackUrl != null && !fallbackUrl.isEmpty()) {
                                Intent fallbackIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
                                fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(fallbackIntent);
                            } else {
                                String pkg = intent.getPackage();
                                if (pkg != null && !pkg.isEmpty()) {
                                    try {
                                        Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
                                        marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        startActivity(marketIntent);
                                    } catch (Exception eMarket) {
                                        Intent webMarket = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
                                        webMarket.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        startActivity(webMarket);
                                    }
                                } else {
                                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Aplikasi eksternal pendukung tidak ditemukan.", Toast.LENGTH_SHORT).show());
                                }
                            }
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Gagal memproses intent: " + url, e);
                    }
                    // KRUSIAL: Selalu kembalikan true agar WebView TIDAK PERNAH memuat URL intent ke dalam frame web internal (mencegah net::ERR_UNKNOWN_URL_SCHEME)
                    return true;
                }

                // 5. Market / Play Store Link
                if (url.startsWith("market://")) {
                    try {
                        Intent marketIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(marketIntent);
                    } catch (Exception e) {
                        Log.e(TAG, "Gagal membuka Play Store: " + url, e);
                    }
                    return true;
                }

                // 6. Tautan website luar lainnya (http://, https://) -> Buka di browser eksternal Android
                try {
                    Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(browserIntent);
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "Gagal membuka browser luar untuk: " + url, e);
                }

                // Jangan izinkan WebView memuat skema kustom asing apa pun secara internal
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Pulihkan tampilan jika terjadi error pada main frame
                if (request != null && request.isForMainFrame()) {
                    String reqUrl = request.getUrl() != null ? request.getUrl().toString() : "";
                    // Cegah halaman error ERR_UNKNOWN_URL_SCHEME atau skema asing yang merusak layar POS
                    if (reqUrl.startsWith("intent:") || reqUrl.startsWith("market:") ||
                        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && error != null && error.getErrorCode() == WebViewClient.ERROR_UNSUPPORTED_SCHEME)) {
                        Log.w(TAG, "Mencegah layar error skema URL asing, memulihkan ke aset lokal...");
                        view.loadUrl(OFFLINE_FALLBACK_URL);
                        return;
                    }
                    if (reqUrl.startsWith("http") && !reqUrl.contains("android_asset")) {
                        Log.w(TAG, "Gagal memuat URL cloud utama, beralih ke aset offline internal...");
                        view.loadUrl(OFFLINE_FALLBACK_URL);
                    }
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Abaikan error sub-resource (CDN, font, analytics, dll) agar WebView tidak reload sendiri
                if (failingUrl != null && failingUrl.startsWith("intent:")) {
                    view.loadUrl(OFFLINE_FALLBACK_URL);
                    return;
                }
                if (failingUrl != null && PRODUCTION_URL.equalsIgnoreCase(failingUrl)) {
                    Log.w(TAG, "Gagal koneksi internet ke URL cloud produksi, beralih ke offline.");
                    view.loadUrl(OFFLINE_FALLBACK_URL);
                }
            }
        });

        // WebChromeClient dengan dukungan Upload Gambar & Kamera
        webView.setWebChromeClient(new WebChromeClient() {

            // 1. Dukungan Upload Gambar / File (<input type="file">)
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                    MainActivity.this.filePathCallback = null;
                }

                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");

                try {
                    startActivityForResult(Intent.createChooser(intent, "Pilih Gambar Logo Struk"), FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Tidak dapat membuka galeri: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    return false;
                }
            }

            // 2. Izin Kamera Web untuk Scan QRIS & Barcode Scanner
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                MainActivity.this.runOnUiThread(() -> {
                    request.grant(request.getResources());
                });
            }

            // 3. Izin Lokasi jika diminta
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            // 4. Alert bawaan JavaScript
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Aristotle POS")
                        .setMessage(message)
                        .setPositiveButton("OK", (dialog, which) -> result.confirm())
                        .setCancelable(false)
                        .show();
                return true;
            }

            // 5. Confirm bawaan JavaScript
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Konfirmasi")
                        .setMessage(message)
                        .setPositiveButton("Ya", (dialog, which) -> result.confirm())
                        .setNegativeButton("Batal", (dialog, which) -> result.cancel())
                        .setCancelable(false)
                        .show();
                return true;
            }
        });

        // Injeksi Native JavaScript Bridge untuk cetak dan laci kasir
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        checkAndRequestPermissions();

        // Jalankan Local Offline LAN Print Server (Zero Internet Printer Relay)
        startLocalHttpServer();

        // Bersihkan file update lama jika versi saat ini sudah sama atau lebih baru
        try {
            File cacheDir = getExternalCacheDir() != null ? getExternalCacheDir() : getCacheDir();
            File apkFile = new File(cacheDir, "Aristotle-POS-update.apk");
            if (apkFile.exists()) {
                PackageInfo archiveInfo = getPackageManager().getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
                if (archiveInfo != null) {
                    int cachedCode = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ? (int) archiveInfo.getLongVersionCode() : archiveInfo.versionCode;
                    PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                    int currentCode = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ? (int) pInfo.getLongVersionCode() : pInfo.versionCode;
                    if (cachedCode <= currentCode) {
                        apkFile.delete();
                    }
                }
            }
        } catch (Exception ignored) {}

        // Standar Industri POS: Selalu jalankan UI dari aset internal berkecepatan tinggi (0ms startup),
        // menjaga konsistensi satu database localStorage, bebas pemblokiran mixed-content LAN printer,
        // dan 100% tahan offline di segala kondisi hotspot/Wi-Fi toko!
        Log.i(TAG, "Memuat UI POS langsung dari aset internal berkecepatan tinggi...");
        webView.loadUrl(OFFLINE_FALLBACK_URL);
    }

    /**
     * Memeriksa apakah perangkat terhubung ke internet yang aktif
     */
    private boolean isNetworkConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Network network = cm.getActiveNetwork();
                    if (network != null) {
                        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                    }
                } else {
                    NetworkInfo info = cm.getActiveNetworkInfo();
                    return info != null && info.isConnected();
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getData() != null) {
                        results = new Uri[]{data.getData()};
                    } else if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
        if (requestCode == UNKNOWN_SOURCES_PERMISSION_REQUEST_CODE) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getPackageManager().canRequestPackageInstalls()) {
                installExistingUpdateApk();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pendingInstallAfterPermission) {
            pendingInstallAfterPermission = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getPackageManager().canRequestPackageInstalls()) {
                installExistingUpdateApk();
            }
        }
    }

    private void checkAndRequestPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();

        // Izin Kamera
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.CAMERA);
        }

        // Izin Bluetooth Android 12+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.BLUETOOTH_SCAN);
            }
        } else {
            // Android 11 ke bawah
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
        }

        // Izin Galeri / Memori
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissionsNeeded.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean allGranted = true;
            for (int res : grantResults) {
                if (res != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                Log.d(TAG, "Semua izin sistem telah disetujui pengguna.");
            }
        }
    }

    private long lastBackPressTime = 0;
    private Toast exitToast = null;

    @Override
    public void onBackPressed() {
        if (webView != null) {
            // Tanyakan ke frontend JavaScript apakah ada modal terbuka atau sub-view yang perlu dikembalikan
            webView.evaluateJavascript(
                "(function() { return (typeof window.handleAppBackPress === 'function') ? window.handleAppBackPress() : false; })();",
                value -> {
                    boolean handledByJs = "true".equalsIgnoreCase(value) || "\"true\"".equalsIgnoreCase(value);
                    if (!handledByJs) {
                        runOnUiThread(() -> {
                            if (webView.canGoBack()) {
                                webView.goBack();
                                return;
                            }
                            long currentTime = System.currentTimeMillis();
                            if (currentTime - lastBackPressTime < 2000) {
                                if (exitToast != null) {
                                    exitToast.cancel();
                                }
                                MainActivity.super.onBackPressed();
                            } else {
                                lastBackPressTime = currentTime;
                                if (exitToast != null) {
                                    exitToast.cancel();
                                }
                                exitToast = Toast.makeText(MainActivity.this, "Tekan sekali lagi untuk keluar dari aplikasi", Toast.LENGTH_SHORT);
                                exitToast.show();
                            }
                        });
                    }
                }
            );
            return;
        }
        super.onBackPressed();
    }

    /**
     * Native JavaScript Interface exposed to frontend Web App via `window.AndroidBridge`
     */
    public class AndroidBridge {

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void reportErrorToDiscord(String title, String message, String stack) {
            printExecutor.execute(() -> {
                sendCustomErrorToDiscord(title, message, stack);
            });
        }

        @JavascriptInterface
        public String getAppVersion() {
            return getAppVersionName() + " (Aristotle POS)";
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    return (int) pInfo.getLongVersionCode();
                } else {
                    return pInfo.versionCode;
                }
            } catch (Exception e) {
                return 85;
            }
        }

        @JavascriptInterface
        public String getAppVersionName() {
            try {
                PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pInfo.versionName;
            } catch (Exception e) {
                return "1.2.37";
            }
        }

        @JavascriptInterface
        public void downloadAndInstallApk(final String downloadUrl) {
            MainActivity.this.startApkDownloadAndInstall(downloadUrl);
        }

        @JavascriptInterface
        public boolean hasDownloadedUpdateApk() {
            File cacheDir = getExternalCacheDir() != null ? getExternalCacheDir() : getCacheDir();
            File apkFile = new File(cacheDir, "Aristotle-POS-update.apk");
            if (!apkFile.exists() || apkFile.length() < 100000) return false;

            try {
                PackageInfo archiveInfo = getPackageManager().getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
                if (archiveInfo != null) {
                    int cachedCode = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ? (int) archiveInfo.getLongVersionCode() : archiveInfo.versionCode;
                    int currentCode = getAppVersionCode();
                    if (cachedCode <= currentCode) {
                        apkFile.delete();
                        return false;
                    }
                    return true;
                }
            } catch (Exception e) {
                Log.w(TAG, "Error checking archive info: " + e.getMessage());
            }
            return false;
        }

        @JavascriptInterface
        public boolean installDownloadedApk() {
            return MainActivity.this.installExistingUpdateApk();
        }

        @JavascriptInterface
        public String getPairedDevices() {
            JSONArray arr = new JSONArray();
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
                return arr.toString();
            }

            try {
                Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
                if (pairedDevices != null) {
                    for (BluetoothDevice device : pairedDevices) {
                        JSONObject obj = new JSONObject();
                        obj.put("name", device.getName());
                        obj.put("address", device.getAddress());
                        arr.put(obj);
                    }
                }
            } catch (SecurityException se) {
                Log.e(TAG, "Izin Bluetooth ditolak: " + se.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "Error getPairedDevices: " + e.getMessage());
            }
            return arr.toString();
        }

        @JavascriptInterface
        public void setPreferredPrinter(String address) {
            preferredPrinterAddress = (address != null && !address.trim().isEmpty()) ? address.trim() : null;
            try {
                SharedPreferences.Editor editor = getSharedPreferences(PRINTER_PREFS_NAME, MODE_PRIVATE).edit();
                if (preferredPrinterAddress != null) {
                    editor.putString(KEY_PREF_PRINTER_MAC, preferredPrinterAddress);
                } else {
                    editor.remove(KEY_PREF_PRINTER_MAC);
                }
                editor.apply();
                Log.d(TAG, "Preferred printer MAC updated: " + preferredPrinterAddress);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String getPreferredPrinter() {
            return preferredPrinterAddress != null ? preferredPrinterAddress : "";
        }

        @JavascriptInterface
        public boolean isPrinterReady() {
            synchronized (socketLock) {
                return activeSocket != null && activeSocket.isConnected() && activeOutputStream != null;
            }
        }

        @JavascriptInterface
        public String getConnectedPrinterInfo() {
            synchronized (socketLock) {
                if (activeSocket != null && activeSocket.isConnected()) {
                    try {
                        BluetoothDevice dev = activeSocket.getRemoteDevice();
                        if (dev != null) {
                            return dev.getName() != null && !dev.getName().isEmpty() ? dev.getName() : dev.getAddress();
                        }
                    } catch (Exception ignored) {}
                }
            }
            if (bluetoothAdapter != null && bluetoothAdapter.isEnabled()) {
                try {
                    Set<BluetoothDevice> paired = bluetoothAdapter.getBondedDevices();
                    if (paired != null && !paired.isEmpty()) {
                        if (preferredPrinterAddress != null && !preferredPrinterAddress.isEmpty()) {
                            for (BluetoothDevice d : paired) {
                                if (preferredPrinterAddress.equalsIgnoreCase(d.getAddress())) {
                                    return d.getName() != null && !d.getName().isEmpty() ? d.getName() : d.getAddress();
                                }
                            }
                        }
                        for (BluetoothDevice d : paired) {
                            if (!isExcludedDevice(d) && isThermalPrinterName(d.getName())) {
                                return d.getName() != null && !d.getName().isEmpty() ? d.getName() : d.getAddress();
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }
            return "";
        }

        @JavascriptInterface
        public boolean printBluetooth(String base64Data) {
            if (base64Data == null || base64Data.isEmpty()) return false;
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            return sendRawBytesToPrinter(bytes);
        }

        @JavascriptInterface
        public void printBluetoothAsync(final String base64Data, final String callbackId) {
            printExecutor.execute(() -> {
                if (base64Data == null || base64Data.isEmpty()) {
                    notifyPrintResult(callbackId, false, "Data struk kosong");
                    return;
                }
                try {
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                    boolean ok = sendRawBytesToPrinter(bytes);
                    notifyPrintResult(callbackId, ok, ok ? "" : lastPrintErrorMessage);
                } catch (Exception e) {
                    Log.e(TAG, "Error async printBluetooth: " + e.getMessage(), e);
                    notifyPrintResult(callbackId, false, e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public boolean kickDrawer() {
            return MainActivity.this.kickDrawer();
        }

        @JavascriptInterface
        public void kickDrawerAsync(final String callbackId) {
            printExecutor.execute(() -> {
                boolean ok = MainActivity.this.kickDrawer();
                notifyPrintResult(callbackId, ok, ok ? "" : lastPrintErrorMessage);
            });
        }

        @JavascriptInterface
        public void openBluetoothSettings() {
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                Log.e(TAG, "Gagal membuka pengaturan Bluetooth: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public String getLocalIpAddress() {
            return MainActivity.this.getLocalIpAddress();
        }

        @JavascriptInterface
        public String getWifiGatewayIp() {
            return MainActivity.this.getWifiGatewayIp();
        }

        @JavascriptInterface
        public boolean probeLocalHost(String ip, int port, int timeoutMs) {
            return MainActivity.this.probeLocalHost(ip, port, timeoutMs);
        }

        @JavascriptInterface
        public String sendLocalHttpRequest(String urlStr, String method, String jsonPayload, String posToken, int timeoutMs) {
            return MainActivity.this.sendLocalHttpRequest(urlStr, method, jsonPayload, posToken, timeoutMs);
        }

        @JavascriptInterface
        public int getLocalServerPort() {
            return LOCAL_SERVER_PORT;
        }

        @JavascriptInterface
        public void setLocalPosToken(String token) {
            MainActivity.this.setLocalPosToken(token);
        }

        @JavascriptInterface
        public void triggerHaptic(int type) {
            runOnUiThread(() -> {
                if (webView != null) {
                    if (type == 2) {
                        webView.performHapticFeedback(HapticFeedbackConstants.CONFIRM);
                    } else if (type == 1) {
                        webView.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                    } else {
                        webView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    }
                }
            });
        }

        private boolean sendRawBytesToPrinter(byte[] data) {
            return MainActivity.this.sendRawBytesToPrinter(data);
        }

        private void showToastOnUI(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
    }

    private void notifyPrintResult(final String callbackId, final boolean success, final String errorMsg) {
        runOnUiThread(() -> {
            if (webView != null && callbackId != null && !callbackId.isEmpty()) {
                String safeMsg = (errorMsg != null ? errorMsg : "").replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
                webView.evaluateJavascript(
                    "window.__onNativePrintResult && window.__onNativePrintResult('" + callbackId + "', " + success + ", '" + safeMsg + "');",
                    null
                );
            }
        });
    }

    public boolean kickDrawer() {
        byte[] drawerPulse = new byte[] {
            // 1. ESC p Pin 2 (m = 0, t1 = 30 * 2ms = 60ms, t2 = 125 * 2ms = 250ms)
            0x1B, 0x70, 0x00, 0x1E, 0x7D,
            // 2. ESC p Pin 5 (m = 1)
            0x1B, 0x70, 0x01, 0x1E, 0x7D,
            // 3. ESC p Pin 2 Format Karakter ASCII '0' (0x30)
            0x1B, 0x70, 0x30, 0x1E, 0x7D,
            // 4. ESC p Pin 5 Format Karakter ASCII '1' (0x31)
            0x1B, 0x70, 0x31, 0x1E, 0x7D,
            // 5. DLE DC4 Real-time pulse Pin 2
            0x10, 0x14, 0x01, 0x00, 0x08,
            // 6. DLE DC4 Real-time pulse Pin 5
            0x10, 0x14, 0x01, 0x01, 0x08,
            // 7. Karakter BEL (0x07) standar pembuka laci kasir tertentu
            0x07
        };
        return sendRawBytesToPrinter(drawerPulse);
    }

    private boolean isThermalPrinterName(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase();
        return lower.contains("pos") || lower.contains("rpp") || lower.contains("vsc") ||
               lower.contains("thermal") || lower.contains("printer") || lower.contains("58") ||
               lower.contains("80") || lower.contains("mpt") || lower.contains("zj") ||
               lower.contains("panda") || lower.contains("kassen") || lower.contains("iware") ||
               lower.contains("eppos") || lower.contains("bellav") || lower.contains("goojprt") ||
               lower.contains("sunmi") || lower.contains("inner");
    }

    private boolean isExcludedDevice(BluetoothDevice dev) {
        if (dev == null) return true;
        try {
            if (dev.getBluetoothClass() != null) {
                int major = dev.getBluetoothClass().getMajorDeviceClass();
                if (major == BluetoothClass.Device.Major.AUDIO_VIDEO ||
                    major == BluetoothClass.Device.Major.PHONE ||
                    major == BluetoothClass.Device.Major.WEARABLE) {
                    return true;
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    private OutputStream getOrConnectPrinter() throws IOException {
        synchronized (socketLock) {
            // 1. Jika socket sudah aktif terhubung ke perangkat yang sesuai, gunakan langsung (ZERO DELAY!)
            if (activeSocket != null && activeSocket.isConnected() && activeOutputStream != null) {
                if (preferredPrinterAddress == null || preferredPrinterAddress.equalsIgnoreCase(connectedDeviceAddress)) {
                    return activeOutputStream;
                }
            }
        }

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            throw new IOException("Bluetooth HP sedang mati. Mohon aktifkan Bluetooth di HP Anda.");
        }

        Set<BluetoothDevice> pairedDevices = null;
        try {
            pairedDevices = bluetoothAdapter.getBondedDevices();
        } catch (SecurityException se) {
            throw new IOException("Izin Bluetooth belum diaktifkan di Pengaturan HP: " + se.getMessage());
        }

        if (pairedDevices == null || pairedDevices.isEmpty()) {
            throw new IOException("Belum ada printer Bluetooth yang di-pair di HP. Buka Pengaturan Bluetooth HP untuk memindai printer kasir.");
        }

        BluetoothDevice targetDevice = null;
        // Prioritaskan printer yang dipilih oleh pengguna di aplikasi (atau tersimpan di SharedPreferences)
        if (preferredPrinterAddress != null && !preferredPrinterAddress.isEmpty()) {
            for (BluetoothDevice dev : pairedDevices) {
                if (preferredPrinterAddress.equalsIgnoreCase(dev.getAddress())) {
                    targetDevice = dev;
                    break;
                }
            }
        }

        // Jika belum ada printer terpilih atau printer yang disimpan tidak ditemukan lagi:
        if (targetDevice == null) {
            for (BluetoothDevice dev : pairedDevices) {
                if (!isExcludedDevice(dev) && isThermalPrinterName(dev.getName())) {
                    targetDevice = dev;
                    break;
                }
            }
        }

        // Fallback: Jika hanya ada 1 perangkat yang di-pair dan bukan perangkat audio/ponsel
        if (targetDevice == null && pairedDevices.size() == 1) {
            BluetoothDevice single = pairedDevices.iterator().next();
            if (!isExcludedDevice(single)) {
                targetDevice = single;
            }
        }

        if (targetDevice == null) {
            throw new IOException("Printer kasir belum dipilih. Silakan buka Pengaturan Printer dan ketuk 'Sambung Bluetooth' untuk memilih printer Anda.");
        }

        String targetName = targetDevice.getName() != null ? targetDevice.getName() : targetDevice.getAddress();
        Log.d(TAG, "Membuka koneksi Bluetooth ke printer: " + targetName + " (" + targetDevice.getAddress() + ")");

        // Hentikan proses scanning discovery agar radio Bluetooth stabil
        try {
            if (bluetoothAdapter.isDiscovering()) {
                bluetoothAdapter.cancelDiscovery();
            }
        } catch (SecurityException ignored) {}
        try { Thread.sleep(120); } catch (InterruptedException ignored) {}

        BluetoothSocket socket = null;
        IOException lastEx = null;

        // Tier 1: Refleksi RFCOMM Port 1 direct (Paling cepat & kompatibel untuk 98% printer POS thermal di Indonesia seperti VSC, RPP02, Panda, ZJ-58)
        try {
            Method m = targetDevice.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
            BluetoothSocket s1 = (BluetoothSocket) m.invoke(targetDevice, 1);
            s1.connect();
            socket = s1;
            Log.d(TAG, "Koneksi Tier 1 (Reflection Port 1) BERHASIL ke: " + targetName);
        } catch (Exception e1) {
            Log.w(TAG, "Tier 1 Reflection Port 1 gagal: " + e1.getMessage() + ". Menyiapkan Tier 2 (Standard SPP)...");
            lastEx = (e1 instanceof IOException) ? (IOException) e1 : new IOException(e1.getMessage());
            try { Thread.sleep(200); } catch (InterruptedException ignored) {}
        }

        // Tier 2: Standar SPP UUID (Untuk printer kasir standar/branded seperti Epson & Star Micronics)
        if (socket == null) {
            try {
                BluetoothSocket s2 = targetDevice.createRfcommSocketToServiceRecord(SPP_UUID);
                s2.connect();
                socket = s2;
                Log.d(TAG, "Koneksi Tier 2 (Standard SPP UUID) BERHASIL ke: " + targetName);
            } catch (Exception e2) {
                Log.e(TAG, "Tier 2 Standard SPP UUID gagal: " + e2.getMessage());
                lastEx = (e2 instanceof IOException) ? (IOException) e2 : new IOException(e2.getMessage());
            }
        }

        if (socket == null) {
            String reason = (lastEx != null && lastEx.getMessage() != null && !lastEx.getMessage().isEmpty()) 
                ? lastEx.getMessage() 
                : "Printer tidak merespons";
            throw new IOException("Gagal menghubungkan ke " + targetName + " (" + reason + "). Pastikan printer menyala & dekat HP.");
        }

        synchronized (socketLock) {
            closeActiveSocket();
            activeSocket = socket;
            activeOutputStream = socket.getOutputStream();
            connectedDeviceAddress = targetDevice.getAddress();
            preferredPrinterAddress = targetDevice.getAddress();

            // Simpan otomatis ke SharedPreferences agar tersimpan permanen
            try {
                getSharedPreferences(PRINTER_PREFS_NAME, MODE_PRIVATE)
                    .edit()
                    .putString(KEY_PREF_PRINTER_MAC, preferredPrinterAddress)
                    .apply();
            } catch (Exception ignored) {}

            Log.d(TAG, "Koneksi Bluetooth aktif dan standby (Zero Delay Ready) ke " + targetName);
            return activeOutputStream;
        }
    }

    private void closeActiveSocket() {
        synchronized (socketLock) {
            if (activeOutputStream != null) {
                try { activeOutputStream.close(); } catch (Exception ignored) {}
                activeOutputStream = null;
            }
            if (activeSocket != null) {
                try { activeSocket.close(); } catch (Exception ignored) {}
                activeSocket = null;
            }
            connectedDeviceAddress = null;
        }
    }

    private boolean sendRawBytesToPrinter(byte[] data) {
        if (bluetoothAdapter == null) {
            lastPrintErrorMessage = "HP tidak memiliki adapter Bluetooth.";
            return false;
        }
        if (!bluetoothAdapter.isEnabled()) {
            lastPrintErrorMessage = "Bluetooth HP sedang mati. Mohon nyalakan Bluetooth di HP Anda.";
            return false;
        }

        boolean hadPriorActiveSocket = false;
        synchronized (socketLock) {
            hadPriorActiveSocket = (activeSocket != null && activeSocket.isConnected() && activeOutputStream != null);
        }

        try {
            // Gunakan socket persistent (Zero Delay) dengan chunking proteksi buffer
            OutputStream out = getOrConnectPrinter();
            writeDataChunked(out, data);
            Log.d(TAG, "Semua " + data.length + " bytes berhasil dikirim ke printer secara tuntas!");
            lastPrintErrorMessage = "";
            return true;
        } catch (IOException e) {
            Log.w(TAG, "Gagal kirim data printer: " + e.getMessage());
            closeActiveSocket();

            // Hanya coba auto-reconnect 1x jika sebelumnya socket SUDAH aktif lalu terputus saat kirim data
            if (hadPriorActiveSocket) {
                try {
                    Thread.sleep(250);
                    OutputStream freshOut = getOrConnectPrinter();
                    writeDataChunked(freshOut, data);
                    Log.d(TAG, "Data terkirim tuntas setelah auto-reconnect!");
                    lastPrintErrorMessage = "";
                    return true;
                } catch (Exception retryErr) {
                    closeActiveSocket();
                    lastPrintErrorMessage = "Koneksi terputus: " + retryErr.getMessage();
                    Log.e(TAG, lastPrintErrorMessage);
                    return false;
                }
            } else {
                lastPrintErrorMessage = e.getMessage();
                return false;
            }
        } catch (SecurityException se) {
            lastPrintErrorMessage = "Izin Bluetooth belum diberikan di Pengaturan Aplikasi.";
            Log.e(TAG, "Izin Bluetooth ditolak: " + se.getMessage());
            return false;
        }
    }

    private void writeDataChunked(OutputStream out, byte[] data) throws IOException {
        int chunkSize = 256;
        for (int i = 0; i < data.length; i += chunkSize) {
            int len = Math.min(chunkSize, data.length - i);
            out.write(data, i, len);
            out.flush();
            if (i + chunkSize < data.length) {
                try {
                    Thread.sleep(25); // Pacing 25ms agar mikrokontroler printer thermal VSC tidak overflow
                } catch (InterruptedException ignored) {}
            }
        }
        try { Thread.sleep(50); } catch (InterruptedException ignored) {}
    }

    public void startApkDownloadAndInstall(final String downloadUrl) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                InputStream input = null;
                OutputStream output = null;
                HttpURLConnection connection = null;
                try {
                    URL url = new URL(downloadUrl);
                    int redirects = 0;
                    while (redirects < 6) {
                        connection = (HttpURLConnection) url.openConnection();
                        connection.setConnectTimeout(20000);
                        connection.setReadTimeout(60000);
                        connection.setInstanceFollowRedirects(true);
                        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 AristotlePOS");
                        connection.setRequestProperty("Accept", "*/*");
                        connection.connect();

                        int status = connection.getResponseCode();
                        if (status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM || status == 307 || status == 308) {
                            String newUrl = connection.getHeaderField("Location");
                            connection.disconnect();
                            if (newUrl == null) break;
                            url = new URL(newUrl);
                            redirects++;
                        } else {
                            break;
                        }
                    }

                    if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                        notifyUpdateError("Gagal mengunduh (HTTP " + connection.getResponseCode() + ")");
                        return;
                    }

                    int fileLength = connection.getContentLength();
                    File cacheDir = getExternalCacheDir() != null ? getExternalCacheDir() : getCacheDir();
                    final File apkFile = new File(cacheDir, "Aristotle-POS-update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    input = connection.getInputStream();
                    output = new FileOutputStream(apkFile);

                    byte[] data = new byte[8192];
                    long total = 0;
                    int count;
                    long lastReportTime = 0;

                    while ((count = input.read(data)) != -1) {
                        total += count;
                        output.write(data, 0, count);

                        long now = System.currentTimeMillis();
                        if (fileLength > 0 && (now - lastReportTime > 250)) {
                            lastReportTime = now;
                            final int progress = (int) ((total * 100) / fileLength);
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    if (webView != null) {
                                        webView.evaluateJavascript("window.KasirApp && window.KasirApp.onUpdateDownloadProgress && window.KasirApp.onUpdateDownloadProgress(" + progress + ");", null);
                                    }
                                }
                            });
                        }
                    }

                    output.flush();

                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (webView != null) {
                                webView.evaluateJavascript("window.KasirApp && window.KasirApp.onUpdateDownloadProgress && window.KasirApp.onUpdateDownloadProgress(100);", null);
                            }
                            installDownloadedApk(apkFile);
                        }
                    });

                } catch (final Exception e) {
                    Log.e(TAG, "Download error: " + e.getMessage(), e);
                    notifyUpdateError(e.getMessage() != null ? e.getMessage() : "Koneksi terputus saat mengunduh");
                } finally {
                    try { if (output != null) output.close(); } catch (Exception ignored) {}
                    try { if (input != null) input.close(); } catch (Exception ignored) {}
                    if (connection != null) connection.disconnect();
                }
            }
        }).start();
    }

    private void notifyUpdateError(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    webView.evaluateJavascript("window.KasirApp && window.KasirApp.onUpdateDownloadError && window.KasirApp.onUpdateDownloadError('" + msg.replace("'", "\\'") + "');", null);
                }
                Toast.makeText(MainActivity.this, "Gagal mengunduh pembaruan: " + msg, Toast.LENGTH_LONG).show();
            }
        });
    }

    public boolean installExistingUpdateApk() {
        File cacheDir = getExternalCacheDir() != null ? getExternalCacheDir() : getCacheDir();
        File apkFile = new File(cacheDir, "Aristotle-POS-update.apk");
        if (apkFile.exists() && apkFile.length() > 100000) {
            installDownloadedApk(apkFile);
            return true;
        }
        return false;
    }

    private void installDownloadedApk(File apkFile) {
        try {
            if (!apkFile.exists() || apkFile.length() < 100000) {
                notifyUpdateError("File APK tidak ditemukan atau belum selesai diunduh.");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    pendingInstallAfterPermission = true;
                    Toast.makeText(this, "Mohon izinkan Aristotle POS memasang aplikasi agar pembaruan dapat dipasang.", Toast.LENGTH_LONG).show();
                    Intent permissionIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    permissionIntent.setData(Uri.parse("package:" + getPackageName()));
                    startActivityForResult(permissionIntent, UNKNOWN_SOURCES_PERMISSION_REQUEST_CODE);
                    return;
                }
            }

            Uri apkUri = androidx.core.content.FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

            // Berikan izin URI eksplisit ke seluruh resolver package installer (AOSP / Samsung / Xiaomi / ColorOS)
            List<ResolveInfo> resInfoList = getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo resolveInfo : resInfoList) {
                String packageName = resolveInfo.activityInfo.packageName;
                grantUriPermission(packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }

            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Install error: " + e.getMessage(), e);
            notifyUpdateError("Gagal membuka installer: " + e.getMessage());
        }
    }

    // ================= LOCAL OFFLINE LAN/HOTSPOT HTTP SERVER =================
    private ServerSocket localHttpServer = null;
    private static final int LOCAL_SERVER_PORT = 8088;
    private boolean isLocalServerRunning = false;
    private volatile String expectedPosToken = "";

    public void setLocalPosToken(String token) {
        this.expectedPosToken = (token != null) ? token.trim() : "";
    }

    private void startLocalHttpServer() {
        if (isLocalServerRunning) return;
        isLocalServerRunning = true;
        new Thread(() -> {
            try {
                localHttpServer = new ServerSocket(LOCAL_SERVER_PORT);
                Log.i(TAG, "Local Offline LAN Print Server berjalan di port " + LOCAL_SERVER_PORT);
                while (isLocalServerRunning && localHttpServer != null && !localHttpServer.isClosed()) {
                    try {
                        Socket client = localHttpServer.accept();
                        handleLocalClient(client);
                    } catch (Exception e) {
                        if (!isLocalServerRunning) break;
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Gagal menjalankan local server di port " + LOCAL_SERVER_PORT + ": " + e.getMessage());
            }
        }).start();
    }

    private void stopLocalHttpServer() {
        isLocalServerRunning = false;
        if (localHttpServer != null) {
            try { localHttpServer.close(); } catch (Exception ignored) {}
            localHttpServer = null;
        }
    }

    private void handleLocalClient(Socket client) {
        new Thread(() -> {
            try {
                BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream(), "UTF-8"));
                OutputStream out = client.getOutputStream();

                String line = reader.readLine();
                if (line == null) {
                    client.close();
                    return;
                }

                String[] parts = line.split(" ");
                String method = parts.length > 0 ? parts[0] : "";
                String path = parts.length > 1 ? parts[1] : "";

                int contentLength = 0;
                String clientToken = "";
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    if (line.toLowerCase().startsWith("content-length:")) {
                        contentLength = Integer.parseInt(line.substring(15).trim());
                    } else if (line.toLowerCase().startsWith("x-pos-token:")) {
                        clientToken = line.substring(12).trim();
                    }
                }

                // Handle CORS Preflight
                if ("OPTIONS".equalsIgnoreCase(method)) {
                    String resp = "HTTP/1.1 200 OK\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n" +
                            "Access-Control-Allow-Headers: Content-Type, X-POS-Token, *\r\n" +
                            "Content-Length: 0\r\n\r\n";
                    out.write(resp.getBytes("UTF-8"));
                    out.flush();
                    client.close();
                    return;
                }

                if ("GET".equalsIgnoreCase(method) && path.startsWith("/ping")) {
                    String json = "{\"status\":\"ok\",\"host\":\"" + Build.MODEL + "\",\"port\":" + LOCAL_SERVER_PORT + "}";
                    byte[] b = json.getBytes("UTF-8");
                    String resp = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: application/json\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Content-Length: " + b.length + "\r\n\r\n";
                    out.write(resp.getBytes("UTF-8"));
                    out.write(b);
                    out.flush();
                    client.close();
                    return;
                }

                // Verifikasi Token Keamanan POS untuk aksi kontrol hardware sensitif (Print & Buka Laci)
                // Izinkan jika token cocok, atau jika expectedPosToken di Host belum disetel/kosong,
                // atau jika clientToken memiliki awalan 'pos_' yang valid dari aplikasi kasir kita
                boolean isAuthorized = (expectedPosToken == null || expectedPosToken.isEmpty() || 
                                        expectedPosToken.equals(clientToken) || 
                                        (clientToken != null && clientToken.startsWith("pos_")));
                if (!isAuthorized) {
                    String err = "{\"status\":\"unauthorized\",\"message\":\"Akses ditolak: Token POS tidak valid\"}";
                    byte[] eb = err.getBytes("UTF-8");
                    String resp = "HTTP/1.1 401 Unauthorized\r\n" +
                            "Content-Type: application/json\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Content-Length: " + eb.length + "\r\n\r\n";
                    out.write(resp.getBytes("UTF-8"));
                    out.write(eb);
                    out.flush();
                    client.close();
                    return;
                }

                if ("POST".equalsIgnoreCase(method) && path.startsWith("/print")) {
                    char[] bodyChars = new char[contentLength];
                    int read = 0;
                    while (read < contentLength) {
                        int r = reader.read(bodyChars, read, contentLength - read);
                        if (r == -1) break;
                        read += r;
                    }
                    String body = new String(bodyChars);
                    JSONObject json = new JSONObject(body);
                    String b64 = json.optString("base64", "");
                    boolean printed = false;
                    if (!b64.isEmpty()) {
                        byte[] raw = Base64.decode(b64, Base64.DEFAULT);
                        printed = sendRawBytesToPrinter(raw);
                    }

                    String respJson = "{\"status\":\"" + (printed ? "success" : "failed") + "\"}";
                    byte[] b = respJson.getBytes("UTF-8");
                    String resp = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: application/json\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Content-Length: " + b.length + "\r\n\r\n";
                    out.write(resp.getBytes("UTF-8"));
                    out.write(b);
                    out.flush();
                    client.close();
                    return;
                }

                if ("POST".equalsIgnoreCase(method) && path.startsWith("/drawer")) {
                    boolean kicked = kickDrawer();
                    String respJson = "{\"status\":\"" + (kicked ? "success" : "failed") + "\"}";
                    byte[] b = respJson.getBytes("UTF-8");
                    String resp = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: application/json\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Content-Length: " + b.length + "\r\n\r\n";
                    out.write(resp.getBytes("UTF-8"));
                    out.write(b);
                    out.flush();
                    client.close();
                    return;
                }

                String resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
                out.write(resp.getBytes("UTF-8"));
                out.flush();
                client.close();

            } catch (Exception e) {
                try { client.close(); } catch (Exception ignored) {}
            }
        }).start();
    }

    public String getLocalIpAddress() {
        // 1. Jalur Utama: Cek IPv4 dari Active Network (Wi-Fi / Ethernet aktif) via ConnectivityManager
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network activeNet = cm.getActiveNetwork();
                if (activeNet != null) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(activeNet);
                    if (caps != null && (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))) {
                        LinkProperties lp = cm.getLinkProperties(activeNet);
                        if (lp != null) {
                            for (LinkAddress la : lp.getLinkAddresses()) {
                                InetAddress addr = la.getAddress();
                                if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                                    String ip = addr.getHostAddress();
                                    if (ip != null && !ip.startsWith("127.")) {
                                        return ip;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "Active network check note: " + e.getMessage());
        }

        // 2. Jalur WifiManager (Standar Wi-Fi Android)
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && wm.isWifiEnabled()) {
                int ipInt = wm.getConnectionInfo().getIpAddress();
                if (ipInt != 0) {
                    String ip = android.text.format.Formatter.formatIpAddress(ipInt);
                    if (ip != null && !ip.equals("0.0.0.0") && !ip.startsWith("127.")) {
                        return ip;
                    }
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "WifiManager check note: " + e.getMessage());
        }

        // 3. Jalur Scan Network Interface (Mencari Interface yang sedang UP/Aktif)
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            String wifiIp = null;
            String hotspotIp = null;
            String fallbackLanIp = null;

            for (NetworkInterface intf : interfaces) {
                // Pastikan interface sedang AKTIF (UP)
                if (!intf.isUp()) continue;

                String name = intf.getName().toLowerCase();
                // Abaikan interface seluler data kartu SIM (4G/5G), VPN, dan loopback
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("pdp") 
                    || name.startsWith("tun") || name.startsWith("ppp") || name.startsWith("dummy") 
                    || name.startsWith("lo")) {
                    continue;
                }

                List<InetAddress> addrs = Collections.list(intf.getInetAddresses());
                for (InetAddress addr : addrs) {
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        String ip = addr.getHostAddress();
                        if (ip != null && !ip.startsWith("127.")) {
                            if (name.startsWith("wlan") || name.startsWith("eth")) {
                                wifiIp = ip;
                            } else if (name.startsWith("ap") || name.startsWith("softap") || name.startsWith("swlan") || name.startsWith("rndis")) {
                                hotspotIp = ip;
                            } else {
                                fallbackLanIp = ip;
                            }
                        }
                    }
                }
            }

            // Prioritas: Wi-Fi aktif terlebih dahulu, baru kemudian Hotspot / Tethering
            if (wifiIp != null) return wifiIp;
            if (hotspotIp != null) return hotspotIp;
            if (fallbackLanIp != null) return fallbackLanIp;
        } catch (Exception ignored) {}

        return "192.168.43.1";
    }

    public String getWifiGatewayIp() {
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                DhcpInfo dhcp = wm.getDhcpInfo();
                if (dhcp != null && dhcp.gateway != 0) {
                    String gateway = android.text.format.Formatter.formatIpAddress(dhcp.gateway);
                    if (gateway != null && !gateway.equals("0.0.0.0") && !gateway.startsWith("127.")) {
                        return gateway;
                    }
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "getWifiGatewayIp note: " + e.getMessage());
        }
        return "";
    }

    public boolean probeLocalHost(String ip, int port, int timeoutMs) {
        if (ip == null || ip.trim().isEmpty()) return false;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(ip.trim(), port), Math.max(150, Math.min(timeoutMs, 2000)));
            return socket.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    public String sendLocalHttpRequest(String urlStr, String method, String jsonPayload, String posToken, int timeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method != null ? method.toUpperCase() : "GET");
            conn.setConnectTimeout(Math.max(400, Math.min(timeoutMs, 4000)));
            conn.setReadTimeout(Math.max(400, Math.min(timeoutMs, 4000)));
            if (posToken != null && !posToken.isEmpty()) {
                conn.setRequestProperty("X-POS-Token", posToken);
            }
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "application/json");

            if ("POST".equalsIgnoreCase(method) && jsonPayload != null) {
                conn.setDoOutput(true);
                byte[] bytes = jsonPayload.getBytes("UTF-8");
                conn.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                    os.flush();
                }
            }

            int code = conn.getResponseCode();
            InputStream is = (code >= 200 && code < 400) ? conn.getInputStream() : conn.getErrorStream();
            if (is == null) return "{\"status\":\"error\",\"code\":" + code + "}";
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            return "{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}";
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private void setupCrashTelemetry() {
        Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            sendNativeCrashToDiscord(thread, throwable);
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });
    }

    private void sendNativeCrashToDiscord(Thread thread, Throwable throwable) {
        try {
            Thread reporter = new Thread(() -> {
                try {
                    JSONObject embed = new JSONObject();
                    embed.put("title", "💥 [Aristotle POS] Native Android Fatal Crash");
                    embed.put("description", "**Fatal Exception:**\n```\n" + (throwable.getMessage() != null ? throwable.getMessage() : throwable.toString()) + "\n```");
                    embed.put("color", 0xDC2626); // Crimson Red

                    JSONArray fields = new JSONArray();

                    JSONObject f1 = new JSONObject();
                    f1.put("name", "📱 Perangkat & Brand");
                    f1.put("value", Build.MANUFACTURER + " " + Build.MODEL + " (Android " + Build.VERSION.RELEASE + ", SDK " + Build.VERSION.SDK_INT + ")");
                    f1.put("inline", true);
                    fields.put(f1);

                    JSONObject f2 = new JSONObject();
                    f2.put("name", "🧵 Thread");
                    f2.put("value", thread.getName() + " (ID: " + thread.getId() + ")");
                    f2.put("inline", true);
                    fields.put(f2);

                    java.io.StringWriter sw = new java.io.StringWriter();
                    java.io.PrintWriter pw = new java.io.PrintWriter(sw);
                    throwable.printStackTrace(pw);
                    String stackStr = sw.toString();
                    if (stackStr.length() > 900) {
                        stackStr = stackStr.substring(0, 880) + "\n... [truncated]";
                    }

                    JSONObject f3 = new JSONObject();
                    f3.put("name", "📋 Native Stack Trace");
                    f3.put("value", "```java\n" + stackStr + "\n```");
                    f3.put("inline", false);
                    fields.put(f3);

                    embed.put("fields", fields);
                    
                    JSONObject footer = new JSONObject();
                    footer.put("text", "Aristotle POS Native Crash Watchdog");
                    embed.put("footer", footer);

                    JSONObject payload = new JSONObject();
                    payload.put("username", "Aristotle POS Native Watchdog");
                    payload.put("avatar_url", "https://miezlearning.github.io/aristotle-pos/icon-192.png");
                    JSONArray embeds = new JSONArray();
                    embeds.put(embed);
                    payload.put("embeds", embeds);

                    URL url = new URL(DISCORD_WEBHOOK_URL);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(3000);
                    conn.setReadTimeout(3000);

                    byte[] outputBytes = payload.toString().getBytes("UTF-8");
                    conn.getOutputStream().write(outputBytes);
                    conn.getOutputStream().flush();
                    conn.getOutputStream().close();
                    conn.getResponseCode();
                    conn.disconnect();
                } catch (Exception ignored) {}
            });
            reporter.start();
            reporter.join(2500);
        } catch (Exception ignored) {}
    }

    private void sendCustomErrorToDiscord(String title, String message, String stack) {
        try {
            JSONObject embed = new JSONObject();
            embed.put("title", "🚨 [Aristotle POS] " + (title != null ? title : "Hardware / Native Event"));
            embed.put("description", "```\n" + (message != null ? message : "No detail") + "\n```");
            embed.put("color", 0xF59E0B); // Amber

            JSONArray fields = new JSONArray();
            JSONObject f1 = new JSONObject();
            f1.put("name", "📱 Perangkat");
            f1.put("value", Build.MANUFACTURER + " " + Build.MODEL + " (Android " + Build.VERSION.RELEASE + ")");
            f1.put("inline", true);
            fields.put(f1);

            if (stack != null && !stack.isEmpty()) {
                JSONObject f2 = new JSONObject();
                f2.put("name", "📋 Detail");
                String s = stack.length() > 900 ? stack.substring(0, 880) + "..." : stack;
                f2.put("value", "```\n" + s + "\n```");
                f2.put("inline", false);
                fields.put(f2);
            }
            embed.put("fields", fields);

            JSONObject footer = new JSONObject();
            footer.put("text", "Aristotle POS Watchdog Telemetry");
            embed.put("footer", footer);

            JSONObject payload = new JSONObject();
            payload.put("username", "Aristotle POS Watchdog");
            payload.put("avatar_url", "https://miezlearning.github.io/aristotle-pos/icon-192.png");
            JSONArray embeds = new JSONArray();
            embeds.put(embed);
            payload.put("embeds", embeds);

            URL url = new URL(DISCORD_WEBHOOK_URL);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);

            byte[] outputBytes = payload.toString().getBytes("UTF-8");
            conn.getOutputStream().write(outputBytes);
            conn.getOutputStream().flush();
            conn.getOutputStream().close();
            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopLocalHttpServer();
        closeActiveSocket();
        printExecutor.shutdown();
    }
}
