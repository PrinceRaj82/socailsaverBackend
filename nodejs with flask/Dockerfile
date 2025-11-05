# ✅ Use a small and production-ready Node image
FROM node:20-alpine

# ✅ Set working directory inside container
WORKDIR /app

# ✅ Only copy package files first → better layer caching
COPY package*.json ./

# ✅ Install only production dependencies
RUN npm install --omit=dev

# ✅ Copy all project files
COPY . .

# ✅ Read PORT from env (Render injects automatically)
ENV PORT=3000
EXPOSE 3000

# ✅ Start your server
CMD ["npm", "start"]
