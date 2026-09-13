version=$1
branch=$2
date=$3
tag=$4
baseHref=${5:-/}

echo Version: $version
echo Branch: $branch
echo Date: $date
echo Tag: $tag
echo Base href: $baseHref

file=./dist/browser/assets/release.json
sed -i -e "s/\"version\": \".*\"/\"version\": \"$version\"/g" $file
sed -i -e "s/\"branch\": \".*\"/\"branch\": \"$branch\"/g" $file
sed -i -e "s/\"date\": \".*\"/\"date\": \"$date\"/g" $file

npm run ngsw-config -- "$baseHref"
