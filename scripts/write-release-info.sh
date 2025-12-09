version=$1
branch=$2
date=$3
tag=$4

echo Version: $version
echo Branch: $branch
echo Date: $date
echo Tag: $tag

file=./dist/browser/assets/release.json
sed -i -e "s/\"version\": \".*\"/\"version\": \"$version\"/g" $file
sed -i -e "s/\"branch\": \".*\"/\"branch\": \"$branch\"/g" $file
sed -i -e "s/\"date\": \".*\"/\"date\": \"$date\"/g" $file

npm run ngsw-config