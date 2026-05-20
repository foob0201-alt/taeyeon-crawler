# 태연ERP 크롤링 서비스 배포용 Docker 설정
# Playwright가 미리 설치된 이미지 사용 (별도 설치 불필요)

FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
