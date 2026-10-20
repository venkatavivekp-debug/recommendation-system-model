"""Export pilot tables and a monochrome interval figure without rerunning models."""
import csv
import json
from xml.etree import ElementTree as ET

from amazon_data import file_digest
from final_study import OUTPUT
from multidomain_data import DOMAINS


def write_csv(name, rows):
    with (OUTPUT / name).open('x', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def context_figure(result):
    effects = result['context_minus_C']
    extent = max(abs(v) for d in DOMAINS for v in effects[d]['ndcg']['ci95']) or .001
    def scale(value):
        return 430 + 220 * value / extent
    root = ET.Element('svg', xmlns='http://www.w3.org/2000/svg', width='860', height='290',
                      viewBox='0 0 860 290', role='img', **{'aria-labelledby': 'title description'})
    ET.SubElement(root, 'title', id='title').text = 'Context minus Model C: nDCG@10'
    ET.SubElement(root, 'desc', id='description').text = 'Seed 42. Points are paired-user mean deltas; lines are 95% bootstrap intervals. Warm-start evaluation only.'
    ET.SubElement(root, 'rect', width='860', height='290', fill='white')

    def label(x, y, value, size=14, anchor='start'):
        ET.SubElement(root, 'text', x=str(x), y=str(y), **{
            'font-family': 'sans-serif', 'font-size': str(size), 'text-anchor': anchor}).text = value

    label(25, 30, 'Context minus Model C: nDCG@10', 20)
    label(25, 53, 'Seed 42; paired-user 95% bootstrap intervals; warm-start events only', 13)
    ET.SubElement(root, 'line', x1='430', x2='430', y1='70', y2='215', stroke='black', **{'stroke-dasharray': '4 4'})
    for index, domain in enumerate(DOMAINS):
        y = 93 + 51 * index
        row = effects[domain]['ndcg']
        low, high = row['ci95']
        label(25, y + 5, domain.title())
        ET.SubElement(root, 'line', x1=str(scale(low)), x2=str(scale(high)), y1=str(y), y2=str(y), stroke='black')
        ET.SubElement(root, 'circle', cx=str(scale(row['mean_paired_delta'])), cy=str(y), r='4')
        label(690, y + 5, f"{row['mean_paired_delta']:+.6f}")
    for value in (-extent, 0, extent):
        label(scale(value), 237, f'{value:+.4f}', 12, 'middle')
    label(430, 265, 'Negative favors C; positive favors C+Context. No seed-variance estimate.', 12, 'middle')
    with (OUTPUT / 'context_delta.svg').open('xb') as stream:
        ET.ElementTree(root).write(stream, encoding='utf-8', xml_declaration=True)


def main():
    result = json.loads((OUTPUT / 'pilot_seed42.json').read_text())
    protocol = json.loads((OUTPUT / 'protocol.json').read_text())
    if result['protocol_sha256'] != file_digest(OUTPUT / 'protocol.json'):
        raise ValueError('Result does not match its frozen protocol')
    paths = ['metrics.csv', 'coverage.csv', 'context_deltas.csv', 'context_delta.svg']
    if any((OUTPUT / name).exists() for name in paths):
        raise FileExistsError('Report outputs already exist; refusing to overwrite')
    coverage = protocol['coverage']['test']
    write_csv('metrics.csv', [dict(model=model, domain=domain, seed=42,
        **(entry['macro'] if domain == 'macro' else entry['domains'][domain]['metrics']),
        total_test_positives=sum(v['positives'] for v in coverage.values()) if domain == 'macro' else coverage[domain]['positives'],
        warm_test_positives=sum(v['warm_positives'] for v in coverage.values()) if domain == 'macro' else coverage[domain]['warm_positives'],
        evaluated_users='' if domain == 'macro' else entry['domains'][domain]['evaluated_users'], seed_sd='not_available')
        for model, entry in result['models'].items() for domain in (*DOMAINS, 'macro')])
    write_csv('coverage.csv', [dict(domain=d, **{k: v for k, v in coverage[d].items() if k != 'cold_start_categories'},
                                   **coverage[d]['cold_start_categories']) for d in DOMAINS])
    write_csv('context_deltas.csv', [dict(domain=d, metric=m, delta=row['mean_paired_delta'],
        ci95_low=row['ci95'][0], ci95_high=row['ci95'][1], users=row['users'],
        total_test_positives=coverage[d]['positives'], warm_test_positives=coverage[d]['warm_positives'])
        for d in DOMAINS for m, row in result['context_minus_C'][d].items()])
    context_figure(result)
    print('\n'.join(str(OUTPUT / name) for name in paths))


if __name__ == '__main__':
    main()
