import os
import shlex
import subprocess


def create(**kwargs):
    print(kwargs.items())
    
    key_path = os.path.dirname(os.path.abspath(__file__)) + kwargs["key_path"]
    csr_path = os.path.dirname(os.path.abspath(__file__))  + kwargs["csr_path"]
    cert_path = os.path.dirname(os.path.abspath(__file__)) + kwargs["cert_path"]

    try:
        cmd=shlex.split('openssl genrsa -out key_path 2048')

        subprocess.check_output(cmd)
        cmd=shlex.split('openssl req -new -sha256 -key key_path -out csr_path')

        subprocess.check_output(cmd)
        cmd=shlex.split('openssl x509 -req -in csr_path -signkey key_path -out cert_path')
        subprocess.check_output(cmd)
    except Exception as e:
        print(f"Ошибка вначале программы: {e.args.__str__()}")

if __name__ == "__main__":
    import sys
    create(key_path="/certs/key.pem", csr_path = "/certs/csr.pem", cert_path ="/certs/cert.pem")
