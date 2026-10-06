# Site do ebook + Efí Bank (Pix)

Landing page mobile-first para vender o ebook **“Segredos para Conquistar o Amor Depois dos 50”** por **R$ 14,90** (preço anterior exibido: R$ 50,00).

O link do Google Drive **não fica no HTML**. Ele é mantido no servidor e só é enviado ao navegador depois que a API Pix da Efí retorna a cobrança como `CONCLUIDA`.

## 1. Requisitos

- Node.js 18 ou superior
- Conta Efí com uma aplicação API Pix criada
- `Client_Id` e `Client_Secret`
- Certificado `.p12` da Efí
- Chave Pix cadastrada na conta
- Escopos da aplicação: `cob.write` e `cob.read`

## 2. Instalação

```bash
npm install
cp .env.example .env
```

Coloque seu certificado na pasta:

```text
certificates/certificado.p12
```

Depois edite `.env` e preencha:

```env
EFI_SANDBOX=true
EFI_CLIENT_ID=...
EFI_CLIENT_SECRET=...
EFI_CERT_PATH=./certificates/certificado.p12
EFI_CERT_PASSPHRASE=
EFI_PIX_KEY=...
APP_SECRET=uma-chave-longa-e-aleatoria
PRODUCT_PRICE=14.90
PRODUCT_DOWNLOAD_URL=https://drive.google.com/file/d/1fgTe0VI7MHdPE67wos_H-vkPLJiFXzIi/view
```

## 3. Executar

```bash
npm start
```

Abra:

```text
http://localhost:3000
```

## 4. Como funciona

1. O cliente clica em **Comprar**.
2. Seu servidor pede um OAuth token à Efí usando Client ID, Client Secret e certificado P12.
3. O servidor cria uma cobrança Pix imediata em `POST /v2/cob` no valor de R$ 14,90.
4. O navegador exibe QR Code e Pix Copia e Cola.
5. A página consulta periodicamente `GET /v2/cob/:txid` por meio do seu servidor.
6. Quando a Efí retorna `status: CONCLUIDA`, o servidor libera o link do Google Drive.

## 5. Homologação da Efí: detalhe importante

Na homologação da API Pix, a Efí informa que cobranças **entre R$ 0,01 e R$ 10,00** podem ser simuladas como confirmadas. Cobranças acima de R$ 10,00 ficam ativas no teste. Portanto, o preço real de R$ 14,90 deve ser usado em produção; para testar o fluxo de confirmação automática no sandbox, use temporariamente um valor de teste abaixo de R$ 10,00.

Nunca leve um valor de teste para produção.

## 6. Produção

Quando tudo estiver validado:

```env
EFI_SANDBOX=false
```

Use as credenciais e o certificado do ambiente de **produção** da Efí.

## 7. Segurança

- Nunca coloque `Client_Secret` no JavaScript do navegador.
- Nunca coloque o certificado `.p12` dentro da pasta `public`.
- Mantenha `APP_SECRET` forte e privado.
- Hospede o site com HTTPS.
- Para operação comercial real, registre pedidos em banco de dados e adicione um webhook da Efí como redundância ao polling.
- Garanta que o arquivo do Google Drive tenha a permissão de compartilhamento necessária para quem comprar conseguir abri-lo.
