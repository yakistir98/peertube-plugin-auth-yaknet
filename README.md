# PeerTube Plugin: YakNet SSO Authentication (`peertube-plugin-auth-yaknet`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PeerTube Engine](https://img.shields.io/badge/PeerTube-%3E%3D5.0.0-orange.svg)](https://joinpeertube.org)
[![YakNet](https://img.shields.io/badge/YakNet-Federated%20Identity-blue.svg)](https://auth.yakhub.com.tr)

**English** | [Türkçe](#türkçe)

`peertube-plugin-auth-yaknet` is an official authentication plugin for [PeerTube](https://joinpeertube.org) that integrates seamless Single Sign-On (SSO) and OAuth2 identity management with the **YakNet** / **YakHub** ecosystem.

---

## 🌟 Key Features

- **One-Click Federated Login:** Seamlessly log in to any PeerTube instance using your central YakNet account.
- **Auto Account & Channel Provisioning:** Automatically creates the user account and default video channel upon first successful authentication.
- **Granular Role Mapping:** Synchronizes admin and standard user roles automatically with YakNet profile privileges.
- **Unified Single Sign-Out:** Logging out from PeerTube gracefully terminates the global SSO session across connected services.
- **Full Screen Reader & Accessibility Compliance:** ARIA labels, semantic markup, and keyboard navigation support.

---

## 📦 Installation

### Option 1: Via PeerTube Admin Interface (Recommended)

1. Go to your PeerTube administration menu: **Administration > Plugins / Themes**.
2. Search for `peertube-plugin-auth-yaknet`.
3. Click **Install**.

### Option 2: Via Command Line

```bash
cd /var/www/peertube/peertube-latest
NODE_ENV=production npm run plugin:install -- --plugin-path peertube-plugin-auth-yaknet
```

---

## ⚙️ Configuration

In your PeerTube admin panel (**Administration > Plugins / Themes > Settings** for `auth-yaknet`), you can configure:

- **Client ID:** Your registered YakNet OAuth2 Application Client ID.
- **Client Secret:** Your YakNet OAuth2 Client Secret.
- **Auth Base URL:** Default is `https://auth.yakhub.com.tr`.

---

<a name="türkçe"></a>

## 🇹🇷 Türkçe Açıklama

`peertube-plugin-auth-yaknet`, PeerTube video sunucuları için geliştirilmiş **YakNet / YakHub Ekosistemi Tekli Oturum Açma (SSO)** ve OAuth2 kimlik doğrulama eklentisidir.

### Özellikler

- **Tek Tıkla Giriş:** Kullanıcılar ayrı bir şifre girmeden merkezi YakNet hesaplarıyla anında oturum açabilir.
- **Otomatik Kanal ve Profil Oluşturma:** İlk girişte kullanıcı adına uygun PeerTube profili ve video kanalı otomatik açılır.
- **Merkezi Çıkış Güvenliği:** PeerTube'dan çıkış yapıldığında oturum güvenliği federatif olarak yönetilir.
- **%100 Ekran Okuyucu Uyumu:** TalkBack, NVDA ve Jaws ile tam uyumlu butonlar ve duyurular.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Developed with ❤️ by **Enes Yakıştır** and the **YakNet** Community.
