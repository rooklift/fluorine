# You can use this Dockerfile to avoid having to install npm to
# get fluorine + electron installed locally.
# You still need node.js to run it, however.
# To use:
# docker build -t fluorine .
# docker run -it --rm -v $PWD:/home/user/work -e MY_UID=$UID fluorine
# The container will exit after fluorine + electron are set up; you can then
# remove the container with:
# docker rmi fluorine
# To run fluorine:
# ./node_modules/.bin/electron

FROM debian:buster

RUN set -e -x; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        gosu sudo \
        npm

# create installation script:
RUN set -x -e; \
    (\
    echo '#!/bin/bash'; \
    echo 'set -x -e'; \
    echo 'npm install --save-dev electron'; \
    echo 'npm install'; \
    ) > /usr/local/bin/fluorine-install.sh; \
    chmod a+x /usr/local/bin/fluorine-install.sh

# run installation script with correct UID/GID
RUN set -x -e; \
    (\
    echo '#!/bin/bash'; \
    echo 'MY_UID=${MY_UID:-1000}'; \
    echo 'set -x -e'; \
    echo 'useradd -M -u "$MY_UID" -o user'; \
    echo 'chown -R user:user /home/user'; \
    echo 'cd /home/user/work'; \
    echo 'exec gosu user "${@:-/usr/local/bin/fluorine-install.sh}"'; \
    ) > /usr/local/bin/entrypoint.sh; \
    chmod a+x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

