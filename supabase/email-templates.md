# Multilingual E-mail Templates

Supabase sends a single template for each type of e-mail. The templates below select the language chosen on the website when the member signed up (stored as `lang`); Catalan is used when no language is recorded.

Location in Supabase: **Authentication** › **E-mails** (or **Email Templates**). For each template, replace the **Subject** and the **Message body** (switch the editor to *Source* / HTML if needed), then click **Save**.

## Confirm signup

**Subject**

```
9e Léger — Confirmació / Confirmation / Conferma / Bestätigung
```

**Message body**

```html
{{ $l := or .Data.lang "ca" }}
{{ if eq $l "en" }}
<h2>Confirm your e-mail address</h2>
<p>Thank you for registering on the 9e Léger uniform guide. Please confirm your e-mail address by following the link below. An administrator will then approve your account.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm my e-mail address</a></p>
{{ else if eq $l "it" }}
<h2>Conferma il tuo indirizzo e-mail</h2>
<p>Grazie per esserti registrato alla guida dell'uniforme del 9e Léger. Conferma il tuo indirizzo e-mail con il link qui sotto. Un amministratore approverà poi il tuo account.</p>
<p><a href="{{ .ConfirmationURL }}">Conferma il mio indirizzo e-mail</a></p>
{{ else if eq $l "fr" }}
<h2>Confirmez votre adresse e-mail</h2>
<p>Merci de vous être inscrit au guide de l'uniforme du 9e Léger. Veuillez confirmer votre adresse e-mail en suivant le lien ci-dessous. Un administrateur approuvera ensuite votre compte.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer mon adresse e-mail</a></p>
{{ else if eq $l "de" }}
<h2>Bestätigen Sie Ihre E-Mail-Adresse</h2>
<p>Vielen Dank für Ihre Anmeldung beim Uniformleitfaden des 9e Léger. Bitte bestätigen Sie Ihre E-Mail-Adresse über den folgenden Link. Anschließend gibt ein Administrator Ihr Konto frei.</p>
<p><a href="{{ .ConfirmationURL }}">Meine E-Mail-Adresse bestätigen</a></p>
{{ else }}
<h2>Confirma la teva adreça electrònica</h2>
<p>Gràcies per registrar-te a la guia d'uniformitat del 9e Léger. Confirma la teva adreça electrònica amb l'enllaç següent. Després, un administrador aprovarà el teu compte.</p>
<p><a href="{{ .ConfirmationURL }}">Confirma la meva adreça</a></p>
{{ end }}
```

## Reset password

**Subject**

```
9e Léger — Contrasenya / Password / Mot de passe / Passwort
```

**Message body**

```html
{{ $l := or .Data.lang "ca" }}
{{ if eq $l "en" }}
<h2>Reset your password</h2>
<p>A password change was requested for your 9e Léger account. Follow the link below to choose a new password. If you did not request it, you may ignore this message.</p>
<p><a href="{{ .ConfirmationURL }}">Choose a new password</a></p>
{{ else if eq $l "it" }}
<h2>Reimposta la password</h2>
<p>È stata richiesta la modifica della password del tuo account del 9e Léger. Segui il link qui sotto per sceglierne una nuova. Se non l'hai richiesta, puoi ignorare questo messaggio.</p>
<p><a href="{{ .ConfirmationURL }}">Scegli una nuova password</a></p>
{{ else if eq $l "fr" }}
<h2>Réinitialisez votre mot de passe</h2>
<p>Une modification du mot de passe de votre compte du 9e Léger a été demandée. Suivez le lien ci-dessous pour en choisir un nouveau. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
<p><a href="{{ .ConfirmationURL }}">Choisir un nouveau mot de passe</a></p>
{{ else if eq $l "de" }}
<h2>Passwort zurücksetzen</h2>
<p>Für Ihr Konto beim 9e Léger wurde eine Passwortänderung angefordert. Über den folgenden Link können Sie ein neues Passwort wählen. Falls Sie dies nicht angefordert haben, können Sie diese Nachricht ignorieren.</p>
<p><a href="{{ .ConfirmationURL }}">Neues Passwort wählen</a></p>
{{ else }}
<h2>Canvia la contrasenya</h2>
<p>S'ha demanat canviar la contrasenya del teu compte del 9e Léger. Fes servir l'enllaç següent per triar-ne una de nova. Si no ho has demanat tu, pots ignorar aquest missatge.</p>
<p><a href="{{ .ConfirmationURL }}">Tria una contrasenya nova</a></p>
{{ end }}
```
