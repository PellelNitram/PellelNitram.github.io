resolution=600

for image in $(ls hr);
do
	inputImage=hr/${image}
	outputImage=lr/${image}
	convert ${inputImage} -resize ${resolution}x${resolution} ${outputImage}
done


