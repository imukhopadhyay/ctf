FROM python:3.12-alpine
RUN adduser -D -u 65534 player 2>/dev/null || true
WORKDIR /app
COPY app.py /app/app.py
USER 65534
EXPOSE 8080
ENV ADMIN_PW=d0nt-gu3ss-me-9f3a2
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["python3", "/app/app.py"]
