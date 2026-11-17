# Android 构建说明

本项目为「AI 智能选号」的 Android 壳工程，使用 WebView 加载 `app/src/main/assets/www` 内的前端页面，启动后从官方开奖接口拉取最新数据，并提供启动动画、桌面图标与版本信息。

## 环境要求

- JDK 17
- Android SDK Platform 33 + Build-Tools 33.0.2
- Gradle 8.0.x

## 本地构建

```bash
cd android
printf "sdk.dir=/path/to/android-sdk\n" > local.properties
gradle assembleRelease
```

产物位于 `app/build/outputs/apk/release/app-release.apk`。

## 签名

`app/keystore.jks` 与 `local.properties` 均不纳入版本控制。签名密码通过环境变量提供：

```bash
export KEYSTORE_PASSWORD=your-password
export KEY_ALIAS=ailottery
export KEY_PASSWORD=your-password
```

生成密钥库：

```bash
keytool -genkeypair -v -keystore app/keystore.jks -alias ailottery \
  -keyalg RSA -keysize 2048 -validity 10000
```

若未提供密钥库，`assembleRelease` 将产出未签名包。

## 前端资源更新

`assets/www` 内的 `js/bundle.js` 由 `lottery-ai/js` 源码合并生成（ES Modules 转为经典脚本，以兼容 WebView 的 `file://` 加载）。前端源码变更后执行 `python3 scripts/sync-web-assets.py` 重新生成，不要直接手改 `bundle.js`。应用需要联网权限以拉取最新开奖。

## 应用信息

| 项目 | 值 |
|---|---|
| 应用名 | AI 智能选号 |
| 包名 | com.monkeycode.ailottery |
| 版本 | 1.2.0 (versionCode 10200) |
| minSdk / targetSdk | 21 / 33 |
