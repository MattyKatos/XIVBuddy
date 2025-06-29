FROM node:18-bullseye

WORKDIR /app
COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 6969
CMD ["npm", "start"]
