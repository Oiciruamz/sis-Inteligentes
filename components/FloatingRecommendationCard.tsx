import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  description: string;
};

export function FloatingRecommendationCard({ title, description }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: '#11121a',
    borderWidth: 1,
    borderColor: '#26273a',
    padding: 14,
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.4)',
    gap: 6,
  },
  title: {
    color: '#f4f4f5',
    fontWeight: '700',
    fontSize: 15,
  },
  description: {
    color: '#c1c1c7',
    lineHeight: 19,
  },
});
