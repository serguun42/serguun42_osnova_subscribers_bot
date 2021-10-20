FROM node:14-alpine3.14

WORKDIR ~

COPY . .

RUN npm install --only=prod

CMD npm run start_bot